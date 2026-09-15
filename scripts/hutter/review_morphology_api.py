"""Review unresolved Hutter morphology candidates with an OpenAI-compatible API.

This is an audit-only proposal stage. The model receives a closed candidate
set produced by :mod:`scripts.hutter.morphology` and may either select one of
those candidates or abstain. It never creates Strong numbers and never edits
the published Hutter mappings.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_QUEUE = (
    REPO_ROOT / "data" / "hutter" / "review_reports" / "morphology_review_queue.json"
)
DEFAULT_OUTPUT = (
    REPO_ROOT / "data" / "hutter" / "review_reports" / "morphology_api_proposals.jsonl"
)
DEFAULT_SUMMARY = (
    REPO_ROOT / "data" / "hutter" / "review_reports" / "morphology_api_summary.json"
)
DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
VALID_CONFIDENCES = {"high", "medium", "low", "abstain"}
RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Propose Hutter morphology candidates through an OpenRouter-compatible API."
    )
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument(
        "--model", default=os.environ.get("OPENROUTER_HUTTER_MODEL", DEFAULT_MODEL)
    )
    parser.add_argument(
        "--base-url", default=os.environ.get("OPENROUTER_BASE_URL", DEFAULT_BASE_URL)
    )
    parser.add_argument("--api-key-env", default="OPENROUTER_API_KEY")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--max-output-tokens", type=int, default=1200)
    parser.add_argument(
        "--reasoning-effort",
        choices=["none", "minimal", "low", "medium", "high", "xhigh", "max"],
        default="none",
        help="OpenRouter reasoning effort; none is the fast default for this review task.",
    )
    parser.add_argument("--max-occurrences", type=int, default=4)
    parser.add_argument("--sleep", type=float, default=0.0)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess items already in the JSONL checkpoint.",
    )
    parser.add_argument(
        "--reconsider-abstentions",
        action="store_true",
        help="Reconsider items whose latest checkpoint status is abstain.",
    )
    parser.add_argument(
        "--retry-errors",
        action="store_true",
        help="Retry items whose latest checkpoint status is error.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned request without calling the API.",
    )
    return parser.parse_args()


def load_dotenv(path: Path) -> None:
    """Load simple KEY=VALUE entries without overriding the shell environment."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


def load_queue(path: Path) -> tuple[list[dict[str, Any]], str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("queue"), list):
        raise ValueError(f"Expected a morphology queue object at {path}")
    return [row for row in payload["queue"] if isinstance(row, dict)], hashlib.sha256(
        path.read_bytes()
    ).hexdigest()


def candidate_ids(item: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for candidate in item.get("candidates") or []:
        if isinstance(candidate, dict):
            strong = str(candidate.get("strong") or "").strip()
            if strong and strong not in values:
                values.append(strong)
    if not values:
        for value in item.get("proposed_strongs") or []:
            strong = str(value).strip()
            if strong and strong not in values:
                values.append(strong)
    return sorted(values)


def compact_item(item: dict[str, Any], max_occurrences: int = 4) -> dict[str, Any]:
    """Build the only queue evidence that is sent to the model."""
    candidates: list[dict[str, Any]] = []
    for candidate in item.get("candidates") or []:
        if (
            not isinstance(candidate, dict)
            or not str(candidate.get("strong") or "").strip()
        ):
            continue
        parse = candidate.get("parse")
        candidates.append(
            {
                "strong": str(candidate["strong"]),
                "score": candidate.get("score"),
                "parse": parse if isinstance(parse, dict) else None,
                "evidence": str(candidate.get("evidence") or ""),
            }
        )
    occurrences = []
    for occurrence in item.get("occurrences") or []:
        if not isinstance(occurrence, dict):
            continue
        occurrences.append(
            {
                "book": occurrence.get("book"),
                "chapter": occurrence.get("chapter"),
                "verse": occurrence.get("verse"),
                "surface": occurrence.get("text"),
            }
        )
        if len(occurrences) >= max_occurrences:
            break
    return {
        "item": str(item.get("normalized") or ""),
        "occurrence_count": int(item.get("occurrence_count") or len(occurrences)),
        "occurrences": occurrences,
        "deterministic_status": str(item.get("review_status") or ""),
        "candidates": candidates,
    }


def build_messages(
    items: list[dict[str, Any]],
    max_occurrences: int = 4,
    *,
    reconsider_abstentions: bool = False,
) -> list[dict[str, str]]:
    system = (
        "You are a cautious reviewer for a historical Hebrew Strong's-number queue. "
        "The candidate list is closed: you may select exactly one supplied candidate or abstain. "
        "Never invent, normalize, merge, or look up a Strong's ID. Do not use word position or "
        "surrounding alignment as evidence. Use calibrated selection, not absolute certainty: "
        "select a supplied candidate when the candidate list has exactly one plausible candidate "
        "whose morphology fits the normalized surface, even without direct corpus attestation, "
        "or when one candidate is materially better than its alternatives by morphology, score, "
        "attestation, or lexical evidence. Do not reject a candidate merely because Hutter pointing "
        "or spelling differs from the supplied parse. Abstain only when no candidates are supplied, "
        "the best candidates are tied or nearly tied, the evidence contradicts the candidate, or "
        "the prefix/suffix composition cannot be explained. Treat deterministic candidates as "
        "evidence, not truth. Return JSON only as an array with one object per item "
        "using exactly these keys: item, choice, confidence, reason. confidence must be high, medium, "
        "low, or abstain. Use abstain when choice is null. Keep reason under 30 words."
    )
    if reconsider_abstentions:
        system += (
            " This is a second-pass review of items previously abstained by another model pass. "
            "The previous abstention is not evidence and must not be repeated automatically. "
            "Reconsider each item from the supplied evidence. You may select a low-confidence "
            "candidate when it is the best supported supplied option. Do not abstain merely "
            "because direct corpus attestation is absent, Hutter pointing or spelling differs, or an alternative "
            "parse exists; abstain only for a true tie or near-tie, contradictory evidence, or an "
            "unexplained prefix/suffix composition."
        )
    user = (
        "Review these independent queue items. Do not infer an answer for one item from another.\n"
        + json.dumps(
            [compact_item(item, max_occurrences=max_occurrences) for item in items],
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def extract_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices or not isinstance(choices[0], dict):
        raise ValueError("API response did not contain a chat completion choice")
    message = choices[0].get("message") or {}
    content = message.get("content", "") if isinstance(message, dict) else ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(part["text"])
            for part in content
            if isinstance(part, dict) and part.get("text")
        )
    raise ValueError("API response content was not text")


def parse_json_response(text: str) -> list[dict[str, Any]]:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        stripped = (
            "\n".join(lines[1:-1]).strip()
            if len(lines) >= 3
            else stripped.strip("`").strip()
        )
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        start, end = stripped.find("["), stripped.rfind("]")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(stripped[start : end + 1])
    if isinstance(parsed, dict):
        parsed = parsed.get("items") or parsed.get("results") or parsed.get("proposals")
    if not isinstance(parsed, list) or not all(isinstance(row, dict) for row in parsed):
        raise ValueError("Model response must be a JSON array of objects")
    return parsed


def validate_response(
    rows: list[dict[str, Any]], items: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    allowed = {
        str(item.get("normalized") or ""): set(candidate_ids(item)) for item in items
    }
    validated: dict[str, dict[str, Any]] = {}
    for row in rows:
        if set(row) != {"item", "choice", "confidence", "reason"}:
            raise ValueError(
                "Model response objects must contain exactly item, choice, confidence, and reason"
            )
        item = str(row.get("item") or "").strip()
        if item not in allowed:
            raise ValueError(f"Model returned unknown item: {item!r}")
        if item in validated:
            raise ValueError(f"Model returned duplicate item: {item!r}")
        choice = row.get("choice")
        if choice is not None:
            choice = str(choice).strip()
            if choice not in allowed[item]:
                raise ValueError(
                    f"Model selected non-whitelisted candidate {choice!r} for {item!r}"
                )
        confidence = str(row.get("confidence") or "").strip().lower()
        if confidence not in VALID_CONFIDENCES:
            raise ValueError(f"Invalid confidence for {item!r}: {confidence!r}")
        if choice is None and confidence != "abstain":
            raise ValueError(f"Null choice must use abstain confidence for {item!r}")
        if choice is not None and confidence == "abstain":
            raise ValueError(
                f"Abstain confidence cannot select a candidate for {item!r}"
            )
        reason = " ".join(str(row.get("reason") or "").split())
        if not reason:
            raise ValueError(f"Missing reason for {item!r}")
        if len(reason.split()) > 30:
            raise ValueError(f"Reason exceeds 30 words for {item!r}")
        validated[item] = {
            "item": item,
            "choice": choice,
            "confidence": confidence,
            "reason": reason,
        }
    missing = sorted(set(allowed) - set(validated))
    if missing:
        raise ValueError(f"Model omitted queue items: {', '.join(missing)}")
    return validated


def checkpoint_statuses(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    statuses: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = str(row.get("item") or "").strip()
        if item:
            statuses[item] = str(row.get("status") or "error")
    return statuses


def completed_items(path: Path) -> set[str]:
    return {
        item
        for item, status in checkpoint_statuses(path).items()
        if status in {"proposed", "abstain"}
    }


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def post_batch(
    client: httpx.Client,
    *,
    model: str,
    messages: list[dict[str, str]],
    max_output_tokens: int,
    reasoning_effort: str,
    retries: int,
) -> tuple[str, dict[str, Any]]:
    request: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0,
        "max_tokens": max_output_tokens,
        "reasoning": {"effort": reasoning_effort, "exclude": True},
    }
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            response = client.post("/chat/completions", json=request)
            if response.status_code in RETRYABLE_STATUS_CODES and attempt < retries:
                time.sleep(2**attempt)
                continue
            response.raise_for_status()
            payload = response.json()
            return extract_content(payload), payload
        except (httpx.HTTPError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            time.sleep(2**attempt)
    raise RuntimeError(
        f"API request failed after {retries + 1} attempts: {last_error}"
    ) from last_error


def summary_for(
    path: Path, *, model: str, queue_sha256: str, planned_count: int
) -> dict[str, Any]:
    latest: dict[str, dict[str, Any]] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            item = str(row.get("item") or "").strip()
            if item:
                latest[item] = row
    counts: Counter[str] = Counter(
        str(row.get("status") or "error") for row in latest.values()
    )
    choices = sum(row.get("choice") is not None for row in latest.values())
    return {
        "model": model,
        "queue_sha256": queue_sha256,
        "planned_items": planned_count,
        "checkpoint_rows": len(latest),
        "completed_items": counts["proposed"] + counts["abstain"],
        "proposal_count": choices,
        "abstention_count": counts["abstain"],
        "status_counts": dict(sorted(counts.items())),
        "note": "Proposals are audit-only and are never applied to Hutter mappings by this tool.",
        "created_at": utc_now(),
    }


def main() -> int:
    args = parse_args()
    if args.batch_size < 1 or args.max_output_tokens < 1 or args.timeout <= 0:
        raise SystemExit("batch size, max output tokens, and timeout must be positive")
    if args.offset < 0 or (args.limit is not None and args.limit < 1):
        raise SystemExit("offset must be non-negative and limit must be positive")
    if args.retries < 0 or args.max_occurrences < 1:
        raise SystemExit(
            "retries must be non-negative and max occurrences must be positive"
        )
    if (args.reconsider_abstentions or args.retry_errors) and args.force:
        raise SystemExit("checkpoint selectors cannot be combined with --force")
    if args.reconsider_abstentions and args.retry_errors:
        raise SystemExit(
            "--reconsider-abstentions and --retry-errors are mutually exclusive"
        )

    load_dotenv(REPO_ROOT / ".env")
    queue, queue_sha256 = load_queue(args.queue.expanduser().resolve())
    selected = queue[args.offset :]
    if args.limit is not None:
        selected = selected[: args.limit]
    output_path = args.output.expanduser().resolve()
    statuses = checkpoint_statuses(output_path)
    if args.reconsider_abstentions or args.retry_errors:
        target_status = "abstain" if args.reconsider_abstentions else "error"
        selected = [
            item
            for item in selected
            if statuses.get(str(item.get("normalized") or "")) == target_status
        ]
        done = set()
    else:
        done = completed_items(output_path) if not args.force else set()
    pending = [
        item for item in selected if str(item.get("normalized") or "") not in done
    ]
    planned = [
        pending[index : index + args.batch_size]
        for index in range(0, len(pending), args.batch_size)
    ]
    print(f"Queue items: {len(queue)}")
    print(f"Selected: {len(selected)}")
    print(f"Already checkpointed: {len(done)}")
    print(f"Pending: {len(pending)}")
    print(f"Planned batches: {len(planned)}")
    print(f"Model: {args.model}")
    print(f"Output: {output_path}")
    if args.dry_run:
        if planned:
            print(
                json.dumps(
                    build_messages(
                        planned[0],
                        args.max_occurrences,
                        reconsider_abstentions=args.reconsider_abstentions,
                    ),
                    ensure_ascii=False,
                    indent=2,
                )
            )
        return 0

    api_key = os.environ.get(args.api_key_env)
    if not api_key:
        raise SystemExit(
            f"{args.api_key_env} is not set; use --dry-run to inspect the request without API access."
        )
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://davar.bible",
        "X-Title": "Davar Hutter morphology review",
    }
    with httpx.Client(
        base_url=args.base_url.rstrip("/"), headers=headers, timeout=args.timeout
    ) as client:
        for batch_index, batch in enumerate(planned, start=1):
            batch_id = f"{args.model}-{utc_now()}-{batch_index:04d}"
            started = time.monotonic()
            try:
                response_text, raw_response = post_batch(
                    client,
                    model=args.model,
                    messages=build_messages(
                        batch,
                        args.max_occurrences,
                        reconsider_abstentions=args.reconsider_abstentions,
                    ),
                    max_output_tokens=args.max_output_tokens,
                    reasoning_effort=args.reasoning_effort,
                    retries=args.retries,
                )
                validated = validate_response(parse_json_response(response_text), batch)
                rows = []
                for item in batch:
                    normalized = str(item.get("normalized") or "")
                    result = validated[normalized]
                    rows.append(
                        {
                            "item": normalized,
                            "status": (
                                "proposed"
                                if result["choice"] is not None
                                else "abstain"
                            ),
                            "choice": result["choice"],
                            "confidence": result["confidence"],
                            "reason": result["reason"],
                            "candidate_ids": candidate_ids(item),
                            "occurrence_count": item.get("occurrence_count"),
                            "model": args.model,
                            "review_pass": (
                                "reconsider_abstentions"
                                if args.reconsider_abstentions
                                else "retry_errors" if args.retry_errors else "initial"
                            ),
                            "batch_id": batch_id,
                            "elapsed_seconds": round(time.monotonic() - started, 3),
                            "queue_sha256": queue_sha256,
                            "raw_response": raw_response,
                            "created_at": utc_now(),
                        }
                    )
                write_jsonl(output_path, rows)
                print(
                    f"Batch {batch_index}/{len(planned)}: wrote {len(rows)} proposals"
                )
            except Exception as exc:
                write_jsonl(
                    output_path,
                    [
                        {
                            "item": str(item.get("normalized") or ""),
                            "status": "error",
                            "error": str(exc),
                            "candidate_ids": candidate_ids(item),
                            "model": args.model,
                            "review_pass": (
                                "reconsider_abstentions"
                                if args.reconsider_abstentions
                                else "retry_errors" if args.retry_errors else "initial"
                            ),
                            "batch_id": batch_id,
                            "queue_sha256": queue_sha256,
                            "created_at": utc_now(),
                        }
                        for item in batch
                    ],
                )
                print(f"Batch {batch_index}/{len(planned)}: error recorded; continuing")
            if args.sleep > 0 and batch_index < len(planned):
                time.sleep(args.sleep)

    summary = summary_for(
        output_path,
        model=args.model,
        queue_sha256=queue_sha256,
        planned_count=len(pending),
    )
    summary_path = args.summary.expanduser().resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Summary: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
