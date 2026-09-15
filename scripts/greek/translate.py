"""Batch-translate leftover Greek definitions through OpenRouter.

Spanish: fill empty leftover drafts. Never overwrite UBS imports, except
κύριος / κυρίου, which we retranslate from TBESG.
Hebrew: fill every empty draft from the English TBESG baseline.

Translations stay `draft` (CC BY 4.0 derivative of TBESG). A content-addressed
cache skips identical English and survives `define` rebuilds.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from scripts.translate.client import (
    LiveTransport,
    build_request_body,
    complete,
    is_budget_error,
    is_fatal_error,
    message_text,
    retry_after_seconds as shared_retry_after_seconds,
    supports_structured_output,
)

from scripts.greek.parse_ubs import fold_lemma
from scripts.greek.script_gloss import (
    PreparedField,
    finalize_field,
    has_greek,
    prepare_pair,
    remaining_prose,
)
from scripts.greek.sources import STEPBIBLE_COMMIT
from scripts.greek.stable_json import read_json, write_json
from scripts.greek.text_clean import clean_lexical_text

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DEFINITIONS_DIR = ROOT / "data" / "greek" / "definitions" / STEPBIBLE_COMMIT
DEFAULT_CACHE_PATH = DEFAULT_DEFINITIONS_DIR / "translation-cache.json"
CACHE_SCHEMA = "davar-greek-translation-cache-v1"
PROTECTED_SOURCES = frozenset({"ubs-es"})
PROTECTED_STATUSES = frozenset({"imported", "approved"})
RETRANSLATE_ES_LEMMAS = frozenset({"κυριος"})
DEFAULT_MODEL = "google/gemini-2.5-flash"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_CONCURRENCY = 3
DEFAULT_BATCH_CHARS = 12_000
DEFAULT_MAX_ITEMS = 24
DEFAULT_LEFTOVER_MAX_ITEMS = 8
MAX_RETRIES = 4
TRANSLATION_SOURCE = "openrouter-tbesg"
SYSTEM_PROMPT = (
    "Translate biblical Greek lexicon glosses as natural phrases, not word by word. "
    "Keep multi-word senses together. Keep short and fuller distinct. "
    "Copy «n» markers unchanged. Do not invent or translate Greek; mentions stay as-is. "
    "Preserve names, technical sense, and slash alternatives. "
    "Return JSON {\"t\":[{\"i\":\"id\",\"s\":\"short\",\"f\":\"fuller\"}]} only."
)
# OpenRouter list for deepseek/deepseek-v4-flash-0731 (Sep 2026).
INPUT_USD_PER_M = 0.05
OUTPUT_USD_PER_M = 0.16
INPUT_USD_PER_M_HIGH = 0.08
OUTPUT_USD_PER_M_HIGH = 0.18
DEFAULT_PROVIDER_SORT = "throughput"
DEFAULT_REASONING_EFFORT = "low"
TRANSLATION_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "t": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "f": {"type": "string"},
                    "i": {"type": "string"},
                    "s": {"type": "string"},
                },
                "required": ["i", "s"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["t"],
    "additionalProperties": False,
}

ChatFn = Callable[[list[dict[str, str]], str], str]


@dataclass(frozen=True)
class Settings:
    api_key: str
    model: str
    base_url: str
    concurrency: int
    batch_chars: int
    max_items: int


@dataclass(frozen=True)
class Job:
    entry_id: str
    sense_id: str
    target: str
    lemma: str
    short: str
    fuller: str
    cache_key: str
    short_prep: PreparedField | None = None
    fuller_prep: PreparedField | None = None


def default_cache_path() -> Path:
    return DEFAULT_CACHE_PATH


def load_env_files(*paths: Path) -> None:
    for path in paths:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


def load_settings(
    model: str | None = None,
    concurrency: int | None = None,
    batch_chars: int | None = None,
    max_items: int | None = None,
    require_key: bool = True,
) -> Settings:
    load_env_files(ROOT / ".env", ROOT / ".env.local")
    api_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if require_key and not api_key:
        raise SystemExit(
            "OPENROUTER_API_KEY is missing. Copy .env.example to .env "
            "and paste the OpenRouter key."
        )
    return Settings(
        api_key=api_key,
        model=(
            model
            or os.environ.get("OPENROUTER_MODEL")
            or DEFAULT_MODEL
        ).strip(),
        base_url=(
            os.environ.get("OPENROUTER_BASE_URL") or DEFAULT_BASE_URL
        ).rstrip("/"),
        concurrency=max(
            1,
            concurrency
            or int(os.environ.get("OPENROUTER_CONCURRENCY", DEFAULT_CONCURRENCY)),
        ),
        batch_chars=max(
            1_000,
            batch_chars
            or int(os.environ.get("OPENROUTER_BATCH_CHARS", DEFAULT_BATCH_CHARS)),
        ),
        max_items=max(
            1,
            max_items
            or int(os.environ.get("OPENROUTER_MAX_ITEMS", DEFAULT_MAX_ITEMS)),
        ),
    )


def source_hash(target: str, short: str, fuller: str) -> str:
    payload = f"{target}\n{short}\n{fuller}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def usable_text(definition: dict | None) -> bool:
    if not definition:
        return False
    return bool(definition.get("short") or definition.get("fuller"))


def translation_complete(
    definition: dict | None,
    lemma: str = "",
    target: str = "",
) -> bool:
    """True when the row no longer needs OpenRouter (API or script-only)."""
    if not usable_text(definition):
        return False
    if definition.get("needs_prose"):
        return False
    if target == "es" and allows_spanish_retranslate(lemma):
        if definition.get("source") in PROTECTED_SOURCES:
            return False
        if definition.get("review_status") in PROTECTED_STATUSES:
            return False
    return True


def allows_spanish_retranslate(lemma: str) -> bool:
    return fold_lemma(lemma) in RETRANSLATE_ES_LEMMAS


def is_protected(
    definition: dict | None,
    lemma: str = "",
    target: str = "",
) -> bool:
    if not definition:
        return False
    if target == "es" and allows_spanish_retranslate(lemma):
        return False
    if definition.get("source") in PROTECTED_SOURCES:
        return True
    if definition.get("review_status") in PROTECTED_STATUSES and usable_text(
        definition
    ):
        return True
    return False


def empty_cache() -> dict:
    return {
        "items": {},
        "model": None,
        "schema": CACHE_SCHEMA,
    }


def load_cache(path: Path) -> dict:
    if not path.is_file():
        return empty_cache()
    payload = read_json(path)
    if payload.get("schema") != CACHE_SCHEMA or not isinstance(
        payload.get("items"), dict
    ):
        return empty_cache()
    return payload


def save_cache(path: Path, cache: dict) -> None:
    write_json(path, cache)


def fill_script_translations(
    store: dict,
    targets: tuple[str, ...],
    cache: dict,
    force: bool = False,
) -> int:
    filled = 0
    items = cache.setdefault("items", {})
    for entry in store.get("entries", {}).values():
        lemma = entry.get("lemma") or ""
        for sense in entry.get("senses", []):
            english = sense.get("definitions", {}).get("en") or {}
            short = clean_lexical_text(english.get("short") or "")
            fuller = clean_lexical_text(english.get("fuller") or "")
            if fuller == short:
                fuller = ""
            if not short and not fuller:
                continue
            for target in targets:
                current = sense.get("definitions", {}).get(target)
                key = source_hash(target, short, fuller)
                cached = items.get(key)
                if not force:
                    if is_protected(current, lemma=lemma, target=target):
                        continue
                    if translation_complete(
                        current, lemma=lemma, target=target
                    ) or translation_complete(cached, lemma=lemma, target=target):
                        continue
                short_prep, fuller_prep = prepare_pair(short, fuller, target)
                needs_prose = not (short_prep.script_only and fuller_prep.script_only)
                items[key] = {
                    "fuller": finalize_field(fuller_prep.api_text, fuller_prep, target),
                    "model": "script-gloss",
                    "needs_prose": needs_prose,
                    "short": finalize_field(short_prep.api_text, short_prep, target),
                    "source_text_hash": key,
                }
                filled += 1
    return filled


def collect_jobs(
    store: dict,
    targets: tuple[str, ...],
    cache: dict | None = None,
    force: bool = False,
) -> list[Job]:
    items = (cache or {}).get("items", {})
    jobs: list[Job] = []
    for entry in store.get("entries", {}).values():
        for sense in entry.get("senses", []):
            english = sense.get("definitions", {}).get("en") or {}
            short = clean_lexical_text(english.get("short") or "")
            fuller = clean_lexical_text(english.get("fuller") or "")
            if not short and not fuller:
                continue
            if fuller == short:
                fuller = ""
            lemma = entry.get("lemma") or ""
            sense_id = sense.get("sense_id") or entry.get("id")
            for target in targets:
                current = sense.get("definitions", {}).get(target)
                key = source_hash(target, short, fuller)
                cached = items.get(key)
                if not force:
                    if is_protected(current, lemma=lemma, target=target):
                        continue
                    if translation_complete(
                        current, lemma=lemma, target=target
                    ) or translation_complete(cached, lemma=lemma, target=target):
                        continue
                short_prep, fuller_prep = prepare_pair(short, fuller, target)
                if short_prep.script_only and fuller_prep.script_only:
                    continue
                jobs.append(
                    Job(
                        entry_id=entry["id"],
                        sense_id=sense_id,
                        target=target,
                        lemma=lemma,
                        short=short_prep.api_text,
                        fuller=fuller_prep.api_text,
                        cache_key=key,
                        short_prep=short_prep,
                        fuller_prep=fuller_prep,
                    )
                )
    return jobs


def unique_jobs(jobs: list[Job]) -> list[Job]:
    seen: dict[str, Job] = {}
    for job in jobs:
        seen.setdefault(job.cache_key, job)
    return list(seen.values())


def payload_chars(job: Job) -> int:
    return len(job.cache_key) + len(job.short) + len(job.fuller) + 24


def pack_batches(
    jobs: list[Job],
    batch_chars: int = DEFAULT_BATCH_CHARS,
    max_items: int = DEFAULT_MAX_ITEMS,
) -> list[list[Job]]:
    unique = unique_jobs(jobs)
    batches: list[list[Job]] = []
    current: list[Job] = []
    used = 0
    for job in unique:
        size = payload_chars(job)
        if current and (
            len(current) >= max_items or used + size > batch_chars
        ):
            batches.append(current)
            current = []
            used = 0
        current.append(job)
        used += size
    if current:
        batches.append(current)
    return batches


def request_payload(jobs: list[Job]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for index, job in enumerate(jobs):
        if has_greek(job.short) or has_greek(job.fuller):
            raise ValueError(f"Greek leaked into API payload for {job.entry_id}")
        row = {"i": str(index), "s": job.short}
        if job.fuller:
            row["f"] = job.fuller
        rows.append(row)
    return rows


def build_messages(target: str, jobs: list[Job]) -> list[dict[str, str]]:
    language = "Spanish" if target == "es" else "Modern Hebrew"
    extra = (
        "Use conventional Hebrew biblical names. Christ/Messiah is משיח. "
        "s is a few words only. f is one short sense, not a synonym list."
        if target == "he"
        else "Use natural biblical Spanish. Keep s and f concise."
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"{language}. {extra}\n{json.dumps(request_payload(jobs), ensure_ascii=False, separators=(',', ':'))}",
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
    text: str, jobs: list[Job]
) -> tuple[dict[str, dict[str, str]], list[Job]]:
    payload = extract_json(text)
    rows = payload.get("t") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError("OpenRouter response is not a translation list")
    by_index: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        index = str(row.get("i", "")).strip()
        if index:
            by_index[index] = row
    parsed: dict[str, dict[str, str]] = {}
    skipped: list[Job] = []
    for index, job in enumerate(jobs):
        row = by_index.get(str(index))
        if not row:
            skipped.append(job)
            continue
        short = clean_lexical_text(str(row.get("s") or "")).strip()
        fuller = clean_lexical_text(str(row.get("f") or "")).strip()
        if not short and not fuller:
            skipped.append(job)
            continue
        if job.short_prep is not None:
            short = finalize_field(short, job.short_prep, job.target)
        if job.fuller_prep is not None:
            fuller = finalize_field(fuller, job.fuller_prep, job.target)
        parsed[job.cache_key] = {
            "fuller": fuller or short,
            "short": short or fuller,
        }
    return parsed, skipped


def translated_definition(cached: dict, model: str) -> dict:
    payload = {
        "fuller": cached.get("fuller") or cached.get("short"),
        "license": "CC-BY-4.0",
        "model": model,
        "review_status": "draft",
        "revision": STEPBIBLE_COMMIT,
        "short": cached.get("short") or cached.get("fuller"),
        "source": (
            "script-gloss"
            if cached.get("model") == "script-gloss"
            else TRANSLATION_SOURCE
        ),
        "source_text_hash": cached.get("source_text_hash"),
    }
    if cached.get("needs_prose"):
        payload["needs_prose"] = True
    return payload


def apply_translation_cache(store: dict, cache: dict) -> dict:
    items = cache.get("items") or {}
    model = cache.get("model") or DEFAULT_MODEL
    for entry in store.get("entries", {}).values():
        for sense in entry.get("senses", []):
            definitions = sense.setdefault("definitions", {})
            english = definitions.get("en") or {}
            short = clean_lexical_text(english.get("short") or "")
            fuller = clean_lexical_text(english.get("fuller") or "")
            if fuller == short:
                fuller = ""
            for target in ("es", "he"):
                current = definitions.get(target)
                if is_protected(current, lemma=entry.get("lemma") or "", target=target):
                    continue
                cached = items.get(source_hash(target, short, fuller))
                if not usable_text(cached):
                    continue
                definitions[target] = translated_definition(
                    {**cached, "source_text_hash": source_hash(target, short, fuller)},
                    cached.get("model") or model,
                )
    return store


supports_json_object = supports_structured_output


def reasoning_effort() -> str | None:
    effort = (
        os.environ.get("OPENROUTER_REASONING_EFFORT", DEFAULT_REASONING_EFFORT) or ""
    ).strip()
    if not effort or effort.lower() in {"off", "none", "0"}:
        return None
    return effort


def provider_sort() -> str:
    return (
        os.environ.get("OPENROUTER_PROVIDER_SORT", DEFAULT_PROVIDER_SORT) or ""
    ).strip() or DEFAULT_PROVIDER_SORT


def max_output_tokens() -> int:
    raw = (os.environ.get("OPENROUTER_MAX_TOKENS") or "1200").strip()
    try:
        return max(64, int(raw))
    except ValueError:
        return 1200


def completion_request_body(
    messages: list[dict[str, str]],
    settings: Settings,
) -> dict[str, Any]:
    structured = supports_structured_output(settings.model)
    return build_request_body(
        messages,
        settings.model,
        provider_sort=provider_sort(),
        session_id=os.environ.get("OPENROUTER_SESSION_ID")
        or f"davar-greek-{settings.model}",
        stream=False,
        structured=structured,
        json_schema=TRANSLATION_JSON_SCHEMA,
        response_healing=structured,
        reasoning_effort=reasoning_effort(),
        max_tokens=max_output_tokens(),
    )


def retry_after_seconds(error: Any, attempt: int, detail: str = "") -> float:
    headers = getattr(error, "headers", None)
    return shared_retry_after_seconds(headers, attempt, detail)


def openrouter_complete(
    messages: list[dict[str, str]],
    settings: Settings,
    timeout: int = 180,
) -> tuple[str, dict[str, int]]:
    transport = LiveTransport(
        api_key=settings.api_key,
        base_url=settings.base_url,
        timeout=timeout,
        title="Davar Greek definitions",
    )
    try:
        result = complete(
            messages,
            model=settings.model,
            transport=transport,
            provider_sort=provider_sort(),
            session_id=os.environ.get("OPENROUTER_SESSION_ID")
            or f"davar-greek-{settings.model}",
            stream=False,
            structured=supports_structured_output(settings.model),
            json_schema=TRANSLATION_JSON_SCHEMA,
            response_healing=supports_structured_output(settings.model),
            reasoning_effort=reasoning_effort(),
            max_tokens=max_output_tokens(),
        )
        return result.text, result.usage
    finally:
        transport.close()


def openrouter_chat(
    messages: list[dict[str, str]],
    settings: Settings,
    timeout: int = 180,
) -> str:
    content, _usage = openrouter_complete(messages, settings, timeout=timeout)
    return content


def _translate_batch(
    target: str,
    jobs: list[Job],
    settings: Settings,
    chat: ChatFn,
) -> tuple[dict[str, dict[str, str]], list[Job]]:
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            raw = chat(build_messages(target, jobs), target)
            return parse_translations(raw, jobs)
        except Exception as error:  # noqa: BLE001 — retry then split
            last_error = error
            if is_fatal_error(error):
                raise
            print(
                f"[davar-greek] translate retry {attempt + 1}/{MAX_RETRIES} "
                f"({len(jobs)} items): {error}",
                flush=True,
            )
            if is_budget_error(error):
                time.sleep(min(120, 8 * (attempt + 1)))
                continue
            if len(jobs) > 1 and attempt >= 1:
                mid = max(1, len(jobs) // 2)
                first, first_skip = _translate_batch(
                    target, jobs[:mid], settings, chat
                )
                second, second_skip = _translate_batch(
                    target, jobs[mid:], settings, chat
                )
                first.update(second)
                return first, first_skip + second_skip
            time.sleep(min(8, 2**attempt))
    raise RuntimeError(f"batch failed after retries: {last_error}")


def _pack_work(
    jobs: list[Job],
    batch_chars: int,
    max_items: int,
) -> list[tuple[str, list[Job]]]:
    grouped: dict[str, list[Job]] = {}
    for job in jobs:
        grouped.setdefault(job.target, []).append(job)
    work: list[tuple[str, list[Job]]] = []
    for target, target_jobs in grouped.items():
        work.extend(
            (target, batch)
            for batch in pack_batches(target_jobs, batch_chars, max_items)
        )
    return work


def _cache_translations(
    cache: dict,
    settings: Settings,
    parsed: dict[str, dict[str, str]],
) -> None:
    for key, value in parsed.items():
        cache["items"][key] = {
            "fuller": value["fuller"],
            "model": settings.model,
            "needs_prose": False,
            "short": value["short"],
            "source_text_hash": key,
        }


def _run_batch_pool(
    work: list[tuple[str, list[Job]]],
    settings: Settings,
    cache: dict,
    cache_path: Path,
    chat: ChatFn,
    label: str,
) -> list[Job]:
    skipped: list[Job] = []
    completed = 0
    with ThreadPoolExecutor(max_workers=settings.concurrency) as pool:
        futures = [
            pool.submit(_translate_batch, target, batch, settings, chat)
            for target, batch in work
        ]
        for future in as_completed(futures):
            parsed, missed = future.result()
            _cache_translations(cache, settings, parsed)
            skipped.extend(missed)
            completed += 1
            save_cache(cache_path, cache)
            deferred = f", {len(missed)} deferred" if missed else ""
            print(
                f"[davar-greek] translate {label} {completed}/{len(work)} "
                f"({len(cache['items'])} cached{deferred})",
                flush=True,
            )
    return skipped


def translate_jobs(
    jobs: list[Job],
    settings: Settings,
    cache: dict,
    cache_path: Path,
    chat: ChatFn | None = None,
) -> dict:
    if not jobs:
        return cache
    usage_totals = cache.setdefault(
        "usage",
        {"completion_tokens": 0, "prompt_tokens": 0},
    )

    def default_chat(messages: list[dict[str, str]], _target: str) -> str:
        timeout = int(os.environ.get("OPENROUTER_TIMEOUT", "180"))
        content, usage = openrouter_complete(messages, settings, timeout=timeout)
        usage_totals["completion_tokens"] += usage["completion_tokens"]
        usage_totals["prompt_tokens"] += usage["prompt_tokens"]
        return content

    chat_fn = chat or default_chat
    cache.setdefault("items", {})
    cache["model"] = settings.model
    cache["schema"] = CACHE_SCHEMA
    work = _pack_work(jobs, settings.batch_chars, settings.max_items)
    print(
        f"[davar-greek] translate {len(jobs)} rows → "
        f"{len(work)} batches × {settings.concurrency} workers "
        f"({settings.model})",
        flush=True,
    )
    skipped = _run_batch_pool(
        work, settings, cache, cache_path, chat_fn, "batch"
    )
    leftovers = unique_jobs(skipped)
    if leftovers:
        leftover_work = _pack_work(
            leftovers,
            settings.batch_chars,
            min(DEFAULT_LEFTOVER_MAX_ITEMS, settings.max_items),
        )
        print(
            f"[davar-greek] leftover pass {len(leftovers)} deferred rows → "
            f"{len(leftover_work)} batches",
            flush=True,
        )
        still = unique_jobs(
            _run_batch_pool(
                leftover_work,
                settings,
                cache,
                cache_path,
                chat_fn,
                "leftover",
            )
        )
        if still:
            print(
                f"[davar-greek] {len(still)} rows still deferred; "
                "rerun translate to retry",
                flush=True,
            )
    return cache


def _usd_for_chars(
    chars: int,
    batches: int,
    input_rate: float = INPUT_USD_PER_M,
    output_rate: float = OUTPUT_USD_PER_M,
) -> float:
    input_tokens = (chars / 4) + (len(SYSTEM_PROMPT) / 4 * max(batches, 1))
    output_tokens = chars / 4 * 1.15
    return (input_tokens / 1_000_000 * input_rate) + (
        output_tokens / 1_000_000 * output_rate
    )


def estimate_jobs(jobs: list[Job]) -> dict[str, int | float]:
    unique = unique_jobs(jobs)
    chars = sum(payload_chars(job) for job in unique)
    prose_chars = sum(
        len(remaining_prose(job.short)) + len(remaining_prose(job.fuller))
        for job in unique
    )
    raw_chars = sum(
        len((job.short_prep.original if job.short_prep else job.short))
        + len((job.fuller_prep.original if job.fuller_prep else job.fuller))
        for job in unique
    )
    batches = len(pack_batches(unique))
    usd = _usd_for_chars(prose_chars, batches)
    usd_high = _usd_for_chars(
        prose_chars, batches, INPUT_USD_PER_M_HIGH, OUTPUT_USD_PER_M_HIGH
    )
    raw_usd = _usd_for_chars(raw_chars, batches)
    return {
        "batches": batches,
        "chars": chars,
        "estimated_usd": round(usd, 4),
        "estimated_usd_high": round(usd_high, 4),
        "prose_chars": prose_chars,
        "raw_chars": raw_chars,
        "raw_estimated_usd": round(raw_usd, 4),
        "rows": len(jobs),
        "unique": len(unique),
    }


def run_translation(
    store: dict,
    targets: tuple[str, ...],
    cache_path: Path,
    settings: Settings | None = None,
    dry_run: bool = False,
    script_only: bool = False,
    force: bool = False,
    limit: int | None = None,
    chat: ChatFn | None = None,
) -> dict:
    cache = load_cache(cache_path)
    apply_translation_cache(store, cache)
    script_filled = fill_script_translations(store, targets, cache, force=force)
    if not dry_run:
        apply_translation_cache(store, cache)
    jobs = collect_jobs(store, targets, cache, force=force)
    if limit is not None:
        jobs = jobs[:limit]
    stats = estimate_jobs(jobs)
    stats["script_filled"] = script_filled
    print(
        f"[davar-greek] script-gloss filled {script_filled} rows "
        f"({stats['rows']} still need gloss translation)",
        flush=True,
    )
    print(
        f"[davar-greek] translate queued {stats['rows']} rows "
        f"({stats['unique']} unique, ~{stats['prose_chars']} prose chars, "
        f"{stats['batches']} batches, ~${stats['estimated_usd']:.2f}"
        f"-${stats['estimated_usd_high']:.2f}; "
        f"~${stats['raw_estimated_usd']:.2f} if citations were sent too)",
        flush=True,
    )
    if script_only:
        save_cache(cache_path, cache)
        apply_translation_cache(store, cache)
        return {"cache": cache, "stats": stats, "store": store}
    if dry_run or not jobs:
        return {"cache": cache, "stats": stats, "store": store}
    assert settings is not None
    cache = translate_jobs(jobs, settings, cache, cache_path, chat=chat)
    apply_translation_cache(store, cache)
    return {"cache": cache, "stats": stats, "store": store}
