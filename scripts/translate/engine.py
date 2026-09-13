"""Pack jobs, run them through an injected transport, and write the cache."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from scripts.translate.cache import DebouncedCache, source_hash
from scripts.translate.client import (
    DEFAULT_PROVIDER_SORT,
    TRANSLATION_JSON_SCHEMA,
    FakeTransport,
    Transport,
    complete,
    is_budget_error,
)

DEFAULT_CONCURRENCY = 8
DEFAULT_BATCH_CHARS = 4_000
DEFAULT_MAX_ITEMS = 8
DEFAULT_LEFTOVER_MAX_ITEMS = 4
MAX_RETRIES = 4
SYSTEM_PROMPT = (
    "Translate the items as natural phrases, not word by word. "
    "Keep short and fuller distinct when both are present. "
    "Preserve placeholders such as {count} and «n» markers. "
    "Do not invent source-language text. "
    "Return JSON {\"t\":[{\"i\":\"id\",\"s\":\"short\",\"f\":\"fuller\"}]} only."
)
LANGUAGE_NAMES = {
    "ar": "Arabic",
    "de": "German",
    "en": "English",
    "es": "Spanish",
    "fa": "Farsi",
    "fr": "French",
    "he": "Modern Hebrew",
    "it": "Italian",
    "pt": "Portuguese",
}


@dataclass(frozen=True)
class TranslateJob:
    item_id: str
    cache_key: str
    target: str
    text: str
    extra: str = ""
    meta: dict[str, Any] | None = None


def payload_chars(job: TranslateJob) -> int:
    return len(job.cache_key) + len(job.text) + len(job.extra) + 24


def unique_jobs(jobs: list[TranslateJob]) -> list[TranslateJob]:
    seen: dict[str, TranslateJob] = {}
    for job in jobs:
        seen.setdefault(job.cache_key, job)
    return list(seen.values())


def pack_batches(
    jobs: list[TranslateJob],
    batch_chars: int = DEFAULT_BATCH_CHARS,
    max_items: int = DEFAULT_MAX_ITEMS,
) -> list[list[TranslateJob]]:
    unique = unique_jobs(jobs)
    batches: list[list[TranslateJob]] = []
    current: list[TranslateJob] = []
    used = 0
    for job in unique:
        size = payload_chars(job)
        if current and (len(current) >= max_items or used + size > batch_chars):
            batches.append(current)
            current = []
            used = 0
        current.append(job)
        used += size
    if current:
        batches.append(current)
    return batches


def request_payload(jobs: list[TranslateJob]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for index, job in enumerate(jobs):
        row = {"i": str(index), "s": job.text}
        if job.extra:
            row["f"] = job.extra
        rows.append(row)
    return rows


def build_messages(
    target: str,
    jobs: list[TranslateJob],
    extra_instruction: str = "",
) -> list[dict[str, str]]:
    language = LANGUAGE_NAMES.get(target, target)
    extra = extra_instruction or f"Use natural {language}."
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"{language}. {extra}\n"
                f"{json.dumps(request_payload(jobs), ensure_ascii=False, separators=(',', ':'))}"
            ),
        },
    ]


def extract_json(text: str) -> Any:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            return json.loads(stripped[start : end + 1])
        raise


def parse_translations(
    text: str,
    jobs: list[TranslateJob],
) -> tuple[dict[str, dict[str, str]], list[TranslateJob]]:
    payload = extract_json(text)
    rows = payload.get("t") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError("Response is not a translation list")
    by_index: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        index = str(row.get("i", "")).strip()
        if index:
            by_index[index] = row
    parsed: dict[str, dict[str, str]] = {}
    skipped: list[TranslateJob] = []
    for index, job in enumerate(jobs):
        row = by_index.get(str(index))
        if not row:
            skipped.append(job)
            continue
        text_out = str(row.get("s") or "").strip()
        extra_out = str(row.get("f") or "").strip()
        if not text_out and not extra_out:
            skipped.append(job)
            continue
        parsed[job.cache_key] = {
            "extra": extra_out or text_out,
            "text": text_out or extra_out,
        }
    return parsed, skipped


def estimate_jobs(jobs: list[TranslateJob]) -> dict[str, int]:
    unique = unique_jobs(jobs)
    chars = sum(payload_chars(job) for job in unique)
    return {
        "batches": len(pack_batches(unique)),
        "chars": chars,
        "rows": len(jobs),
        "unique": len(unique),
    }


def _cache_translations(
    cache: dict[str, Any],
    model: str,
    parsed: dict[str, dict[str, str]],
) -> None:
    items = cache.setdefault("items", {})
    for key, value in parsed.items():
        items[key] = {
            "extra": value.get("extra") or value.get("text") or "",
            "model": model,
            "source_text_hash": key,
            "text": value.get("text") or value.get("extra") or "",
        }


def _pack_work(
    jobs: list[TranslateJob],
    batch_chars: int,
    max_items: int,
) -> list[tuple[str, list[TranslateJob]]]:
    grouped: dict[str, list[TranslateJob]] = {}
    for job in jobs:
        grouped.setdefault(job.target, []).append(job)
    work: list[tuple[str, list[TranslateJob]]] = []
    for target, target_jobs in grouped.items():
        work.extend(
            (target, batch)
            for batch in pack_batches(target_jobs, batch_chars, max_items)
        )
    return work


def _translate_batch(
    target: str,
    jobs: list[TranslateJob],
    *,
    model: str,
    transport: Transport,
    extra_instruction: str,
    provider_sort: str,
    session_id: str | None,
    stream: bool,
    structured: bool,
    response_healing: bool,
    reasoning_effort: str | None,
) -> tuple[dict[str, dict[str, str]], list[TranslateJob], dict[str, int]]:
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            result = complete(
                build_messages(target, jobs, extra_instruction),
                model=model,
                transport=transport,
                provider_sort=provider_sort,
                session_id=session_id,
                stream=stream,
                structured=structured,
                json_schema=TRANSLATION_JSON_SCHEMA,
                response_healing=response_healing,
                reasoning_effort=reasoning_effort,
            )
            parsed, skipped = parse_translations(result.text, jobs)
            return parsed, skipped, result.usage
        except Exception as error:  # noqa: BLE001 — retry then split
            last_error = error
            if is_budget_error(error) and attempt + 1 < MAX_RETRIES:
                continue
            if len(jobs) > 1 and attempt >= 1:
                mid = max(1, len(jobs) // 2)
                first, first_skip, first_usage = _translate_batch(
                    target,
                    jobs[:mid],
                    model=model,
                    transport=transport,
                    extra_instruction=extra_instruction,
                    provider_sort=provider_sort,
                    session_id=session_id,
                    stream=stream,
                    structured=structured,
                    response_healing=response_healing,
                    reasoning_effort=reasoning_effort,
                )
                second, second_skip, second_usage = _translate_batch(
                    target,
                    jobs[mid:],
                    model=model,
                    transport=transport,
                    extra_instruction=extra_instruction,
                    provider_sort=provider_sort,
                    session_id=session_id,
                    stream=stream,
                    structured=structured,
                    response_healing=response_healing,
                    reasoning_effort=reasoning_effort,
                )
                first.update(second)
                usage = {
                    "completion_tokens": first_usage.get("completion_tokens", 0)
                    + second_usage.get("completion_tokens", 0),
                    "prompt_tokens": first_usage.get("prompt_tokens", 0)
                    + second_usage.get("prompt_tokens", 0),
                }
                return first, first_skip + second_skip, usage
    raise RuntimeError(f"batch failed after retries: {last_error}")


ProgressFn = Callable[[str, int, int, int], None]


def run_jobs(
    jobs: list[TranslateJob],
    cache: dict[str, Any],
    cache_path: Path,
    *,
    transport: Transport | None = None,
    model: str = "google/gemini-2.5-flash",
    concurrency: int = DEFAULT_CONCURRENCY,
    batch_chars: int = DEFAULT_BATCH_CHARS,
    max_items: int = DEFAULT_MAX_ITEMS,
    extra_instruction: str = "",
    provider_sort: str = DEFAULT_PROVIDER_SORT,
    session_id: str | None = None,
    stream: bool = True,
    structured: bool = True,
    response_healing: bool = False,
    reasoning_effort: str | None = None,
    progress: ProgressFn | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    stats = estimate_jobs(jobs)
    cache.setdefault("items", {})
    cache["model"] = model
    cache["schema"] = cache.get("schema") or "davar-translate-cache-v1"
    usage = cache.setdefault(
        "usage",
        {"completion_tokens": 0, "prompt_tokens": 0},
    )
    if dry_run or not jobs:
        return {"cache": cache, "stats": stats}

    active = transport or FakeTransport()
    work = _pack_work(jobs, batch_chars, max_items)
    writer = DebouncedCache(cache_path, cache)
    skipped = _run_pool(
        work,
        cache=cache,
        writer=writer,
        usage=usage,
        model=model,
        transport=active,
        extra_instruction=extra_instruction,
        provider_sort=provider_sort,
        session_id=session_id,
        stream=stream,
        structured=structured,
        response_healing=response_healing,
        reasoning_effort=reasoning_effort,
        concurrency=concurrency,
        progress=progress,
        label="batch",
    )
    leftovers = unique_jobs(skipped)
    if leftovers:
        leftover_work = _pack_work(
            leftovers,
            batch_chars,
            min(DEFAULT_LEFTOVER_MAX_ITEMS, max_items),
        )
        still = unique_jobs(
            _run_pool(
                leftover_work,
                cache=cache,
                writer=writer,
                usage=usage,
                model=model,
                transport=active,
                extra_instruction=extra_instruction,
                provider_sort=provider_sort,
                session_id=session_id,
                stream=stream,
                structured=structured,
                response_healing=response_healing,
                reasoning_effort=reasoning_effort,
                concurrency=concurrency,
                progress=progress,
                label="leftover",
            )
        )
        stats["deferred"] = len(still)
    else:
        stats["deferred"] = 0
    writer.flush()
    return {"cache": cache, "stats": stats}


def _run_pool(
    work: list[tuple[str, list[TranslateJob]]],
    *,
    cache: dict[str, Any],
    writer: DebouncedCache,
    usage: dict[str, int],
    model: str,
    transport: Transport,
    extra_instruction: str,
    provider_sort: str,
    session_id: str | None,
    stream: bool,
    structured: bool,
    response_healing: bool,
    reasoning_effort: str | None,
    concurrency: int,
    progress: ProgressFn | None,
    label: str,
) -> list[TranslateJob]:
    skipped: list[TranslateJob] = []
    if not work:
        return skipped
    completed = 0
    workers = max(1, min(concurrency, len(work)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [
            pool.submit(
                _translate_batch,
                target,
                batch,
                model=model,
                transport=transport,
                extra_instruction=extra_instruction,
                provider_sort=provider_sort,
                session_id=session_id,
                stream=stream,
                structured=structured,
                response_healing=response_healing,
                reasoning_effort=reasoning_effort,
            )
            for target, batch in work
        ]
        for future in as_completed(futures):
            parsed, missed, batch_usage = future.result()
            _cache_translations(cache, model, parsed)
            usage["completion_tokens"] += batch_usage.get("completion_tokens", 0)
            usage["prompt_tokens"] += batch_usage.get("prompt_tokens", 0)
            if "cached_tokens" in batch_usage:
                usage["cached_tokens"] = usage.get("cached_tokens", 0) + batch_usage[
                    "cached_tokens"
                ]
            skipped.extend(missed)
            completed += 1
            writer.mark()
            if progress:
                progress(label, completed, len(work), len(cache.get("items") or {}))
    return skipped


def job_hash(target: str, text: str, extra: str = "") -> str:
    return source_hash(target, text, extra)
