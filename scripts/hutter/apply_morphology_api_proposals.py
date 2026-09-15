"""Convert validated morphology API proposals into mapping overrides.

The API checkpoint is a closed-set audit: it may choose only a candidate that
the morphology queue supplied. This importer preserves that candidate's best
prefix parse and writes a compact, provenance-rich override list. Human
overrides are loaded after this file by :mod:`scripts.hutter.map_strongs` and
therefore take precedence on overlap.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from scripts.hutter.review_morphology_api import candidate_ids, load_queue

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_QUEUE = (
    REPO_ROOT / "data" / "hutter" / "review_reports" / "morphology_review_queue.json"
)
DEFAULT_OUTPUT = REPO_ROOT / "data" / "hutter" / "morphology_api_overrides.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import validated morphology API proposals as Hutter overrides."
    )
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def load_latest_checkpoint(path: Path) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        item = str(row.get("item") or "").strip()
        if item:
            latest[item] = row
    return latest


def best_selected_candidate(item: dict[str, Any], choice: str) -> dict[str, Any]:
    candidates = [
        candidate
        for candidate in item.get("candidates") or []
        if isinstance(candidate, dict) and str(candidate.get("strong") or "") == choice
    ]
    if not candidates:
        raise ValueError(
            f"Proposal selected {choice!r}, which is not a candidate for {item.get('normalized')!r}"
        )

    def sort_key(candidate: dict[str, Any]) -> tuple[Any, ...]:
        parse = candidate.get("parse") or {}
        prefixes = tuple(str(prefix) for prefix in parse.get("prefixes") or [])
        return (
            -float(candidate.get("score") or 0.0),
            -float(candidate.get("base_score") or 0.0),
            -int(candidate.get("corpus_count") or 0),
            len(prefixes),
            prefixes,
            str(parse.get("parse_label") or ""),
        )

    return sorted(candidates, key=sort_key)[0]


def composite_strong(prefixes: list[str], strong: str) -> str:
    return "/".join([*prefixes, strong]) if prefixes else strong


def build_overrides(
    queue_path: Path, checkpoint_path: Path
) -> tuple[list[dict[str, Any]], str, str]:
    queue, queue_sha256 = load_queue(queue_path.resolve())
    queue_by_item = {str(item.get("normalized") or ""): item for item in queue}
    latest = load_latest_checkpoint(checkpoint_path.resolve())
    errors = sorted(
        item
        for item, row in latest.items()
        if row.get("status") == "error" and item in queue_by_item
    )
    if errors:
        raise ValueError(
            "Cannot import a checkpoint with latest errors: " + ", ".join(errors[:10])
        )

    overrides: list[dict[str, Any]] = []
    models: set[str] = set()
    for normalized in sorted(queue_by_item):
        row = latest.get(normalized)
        if not row or row.get("status") != "proposed":
            continue
        choice = str(row.get("choice") or "").strip()
        if not choice:
            raise ValueError(f"Proposed row has no choice: {normalized!r}")
        item = queue_by_item[normalized]
        if choice not in set(candidate_ids(item)):
            raise ValueError(f"Non-whitelisted proposal {choice!r} for {normalized!r}")
        selected = best_selected_candidate(item, choice)
        parse = selected.get("parse") or {}
        prefixes = [str(prefix) for prefix in parse.get("prefixes") or []]
        model = str(row.get("model") or "unknown")
        models.add(model)
        overrides.append(
            {
                "forms": [normalized],
                "strong": composite_strong(prefixes, choice),
                "prefixes": prefixes,
                "reason": (
                    f"OpenRouter morphology proposal ({row.get('confidence', 'unknown')}); "
                    f"{row.get('reason', '')}"
                ).strip(),
                "source": "openrouter_morphology_review",
                "model": model,
                "review_pass": str(row.get("review_pass") or "initial"),
                "confidence": str(row.get("confidence") or ""),
                "queue_sha256": queue_sha256,
                "candidate_parse": parse,
                "candidate_score": selected.get("score"),
                "candidate_corpus_count": selected.get("corpus_count"),
                "candidate_evidence": selected.get("evidence"),
            }
        )
    if len(models) > 1:
        raise ValueError(f"Checkpoint contains multiple models: {sorted(models)}")
    return overrides, queue_sha256, next(iter(models), "unknown")


def main() -> int:
    args = parse_args()
    overrides, queue_sha256, model = build_overrides(args.queue, args.checkpoint)
    output_path = args.output.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(overrides, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output": str(output_path),
                "model": model,
                "queue_sha256": queue_sha256,
                "override_count": len(overrides),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
