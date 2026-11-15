#!/usr/bin/env python3
"""Apply the English and Hebrew review of imported TCY definitions.

Eric dictionary rows take their verdict from the committed decision log.
Greek rows are Spanish editions of third-party lexicons and are blocked by
rule. Every TCY row ends approved or blocked, with the reviewer recorded.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

from .definition_hygiene import has_forbidden_controls
from .import_tcysite import read_json, write_json


ROOT = Path(__file__).resolve().parents[2]
CUSTOM_PATH = ROOT / "data/dict/lexicon/custom_definitions.json"
DECISIONS_PATH = ROOT / "data/dict/review/tcysite_eric.jsonl"
REPORT_PATH = ROOT / "data/dict/reports/tcysite_review.json"

ERIC_SOURCE = "tcysite-eric"
GREEK_SOURCES = frozenset(
    {"tcysite-greek-strong", "tcysite-greek-detail", "tcysite-greek-master"}
)
GREEK_REVIEWER = "claude-tcy-review"
REVIEW_FIELDS = ("text_en", "text_he", "reviewed_by", "review_reason")
VERDICTS = frozenset({"approved", "corrected", "blocked"})
REASONS = {
    "third_party_lexicon": "Spanish edition of a third-party lexicon (Strong/Chávez, Tuggy, Vine, Swanson), not the permitted Eric dictionary; for most of these entries the canonical Greek lexicon carries English and Hebrew definitions",
    "source_defect": "The Spanish source row has no translatable meaning",
    "entry_unresolved": "The row is attached to the wrong entry and no single Strong number fits it",
}
HEBREW_LETTER = re.compile(r"[א-ת]")
ENTRY_KEY = re.compile(r"[HGD]\d+[A-Za-z]?")
RowKey = tuple[str, str]


def tcy_rows(custom: dict[str, Any]) -> Iterator[tuple[str, dict[str, Any]]]:
    for strong, entry in custom.items():
        for definition in entry.get("definitions", []):
            if str(definition.get("source", "")).startswith("tcysite-"):
                yield strong, definition


def row_key(definition: dict[str, Any]) -> RowKey:
    return definition["source_file"], definition["source_row"]


def decision_errors(decision: dict[str, Any]) -> list[str]:
    verdict = decision.get("verdict")
    errors = [] if verdict in VERDICTS else [f"unknown verdict {verdict!r}"]
    for field in ("source_file", "source_row", "text_es", "reviewer", "evidence"):
        if not str(decision.get(field) or "").strip():
            errors.append(f"missing {field}")
    if "entry" in decision and not ENTRY_KEY.fullmatch(str(decision["entry"])):
        errors.append(f"invalid entry {decision['entry']!r}")
    if verdict == "blocked":
        if decision.get("reason") not in REASONS:
            errors.append(f"unknown reason {decision.get('reason')!r}")
        if decision.get("text_en") or decision.get("text_he"):
            errors.append("blocked decision carries a translation")
        return errors
    text_en = str(decision.get("text_en") or "").strip()
    text_he = str(decision.get("text_he") or "").strip()
    if not text_en:
        errors.append("missing text_en")
    if not HEBREW_LETTER.search(text_he):
        errors.append("text_he has no Hebrew letters")
    if any(has_forbidden_controls(text) for text in (text_en, text_he)):
        errors.append("translation has BiDi or zero-width controls")
    if verdict == "corrected" and not isinstance(decision.get("before"), dict):
        errors.append("corrected decision without before")
    return errors


def load_decisions(path: Path = DECISIONS_PATH) -> dict[RowKey, dict[str, Any]]:
    decisions: dict[RowKey, dict[str, Any]] = {}
    if not path.exists():
        return decisions
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        decision = json.loads(line)
        errors = decision_errors(decision)
        if errors:
            raise ValueError(f"{path.name}:{number}: {'; '.join(errors)}")
        key = (decision["source_file"], decision["source_row"])
        if key in decisions:
            raise ValueError(f"{path.name}:{number}: duplicate decision for {key}")
        decisions[key] = decision
    return decisions


def sort_key(decision: dict[str, Any]) -> tuple[str, int]:
    return decision["source_file"], int(decision["source_row"])


def write_decisions(decisions: dict[RowKey, dict[str, Any]], path: Path = DECISIONS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(item, ensure_ascii=False, sort_keys=True) for item in sorted(decisions.values(), key=sort_key)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def reviewed_fields(definition: dict[str, Any], decision: dict[str, Any] | None) -> dict[str, Any]:
    if definition["source"] in GREEK_SOURCES:
        return {"review_status": "blocked", "reviewed_by": GREEK_REVIEWER, "review_reason": "third_party_lexicon"}
    if decision is None:
        return {"review_status": "imported"}
    if decision["verdict"] == "blocked":
        return {"review_status": "blocked", "reviewed_by": decision["reviewer"], "review_reason": decision["reason"]}
    return {
        "text_en": decision["text_en"].strip(),
        "text_he": decision["text_he"].strip(),
        "review_status": "approved",
        "reviewed_by": decision["reviewer"],
    }


def place(custom: dict[str, Any], strong: str, definition: dict[str, Any], target: str) -> None:
    if target == strong:
        return
    source = custom[strong]
    source["definitions"] = [item for item in source["definitions"] if item is not definition]
    if not source["definitions"] and source.get("imported_by") == "tcysite":
        del custom[strong]
    entry = custom.setdefault(
        target,
        {
            "strong_number": target,
            "is_custom": True,
            "term_language": definition.get("term_language"),
            "canonical_strong": target if target[:1] in {"G", "H"} else None,
            "imported_by": "tcysite",
            "definitions": [],
        },
    )
    definition["order"] = max((int(item.get("order", 0)) for item in entry["definitions"]), default=0) + 1
    entry["definitions"].append(definition)


def apply_reviews(
    custom: dict[str, Any], decisions: dict[RowKey, dict[str, Any]]
) -> dict[str, Any]:
    counts: Counter[str] = Counter()
    unreviewed: list[str] = []
    seen: set[RowKey] = set()
    for strong, definition in list(tcy_rows(custom)):
        decision = decisions.get(row_key(definition)) if definition["source"] == ERIC_SOURCE else None
        if decision is not None:
            seen.add(row_key(definition))
            if decision["text_es"] != definition["text_es"]:
                decision = None
        if decision is not None and decision.get("entry"):
            place(custom, strong, definition, decision["entry"])
            strong = decision["entry"]
        for field in REVIEW_FIELDS:
            definition.pop(field, None)
        fields = reviewed_fields(definition, decision)
        definition.update(fields)
        counts[f"{definition['source']}:{decision['verdict'] if decision else fields['review_status']}"] += 1
        if fields["review_status"] == "imported":
            unreviewed.append(f"{strong} {definition['source_file']}#{definition['source_row']}")
    orphans = sorted(f"{file}#{row}" for file, row in set(decisions) - seen)
    return {
        "schema_version": 1,
        "decisions": str(DECISIONS_PATH.relative_to(ROOT)),
        "reasons": REASONS,
        "counts": dict(sorted(counts.items())),
        "reviewers": dict(sorted(Counter(item["reviewer"] for item in decisions.values()).items())),
        "unreviewed": unreviewed,
        "orphan_decisions": orphans,
    }


def export_shards(custom: dict[str, Any], shards: int, out_dir: Path) -> None:
    rows = []
    for strong, definition in tcy_rows(custom):
        if definition["source"] != ERIC_SOURCE:
            continue
        entry = custom[strong]
        rows.append(
            {
                "source_file": definition["source_file"],
                "source_row": definition["source_row"],
                "strong": strong,
                "term": definition.get("term", ""),
                "transliteration": definition.get("transliteration", ""),
                "text_es": definition["text_es"],
                "context": definition.get("context", ""),
                "entry_glosses_en": [
                    item["text_en"]
                    for item in entry.get("definitions", [])
                    if item.get("text_en") and not str(item.get("source", "")).startswith("tcysite-")
                ],
            }
        )
    rows.sort(key=sort_key)
    out_dir.mkdir(parents=True, exist_ok=True)
    size = -(-len(rows) // shards)
    for index in range(shards):
        chunk = rows[index * size : (index + 1) * size]
        (out_dir / f"shard-{index + 1:02d}.json").write_text(
            json.dumps(chunk, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )


def merge(paths: list[Path]) -> None:
    decisions = load_decisions()
    for path in paths:
        decisions.update(load_decisions(path))
    write_decisions(decisions)


def build() -> tuple[str, dict[str, Any]]:
    custom = read_json(CUSTOM_PATH)
    report = apply_reviews(custom, load_decisions())
    return json.dumps(custom, ensure_ascii=False, indent=2) + "\n", report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("apply", help="Write review fields into custom_definitions.json")
    commands.add_parser("check", help="Fail unless every TCY row is reviewed and the data is current")
    export = commands.add_parser("export", help="Write Eric rows as review shards")
    export.add_argument("--shards", type=int, default=8)
    export.add_argument("--out", type=Path, required=True)
    merge_parser = commands.add_parser("merge", help="Merge reviewer JSONL files into the decision log")
    merge_parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()

    if args.command == "export":
        export_shards(read_json(CUSTOM_PATH), args.shards, args.out)
        return
    if args.command == "merge":
        merge(args.paths)
        return
    text, report = build()
    if args.command == "apply":
        CUSTOM_PATH.write_text(text, encoding="utf-8")
        write_json(REPORT_PATH, report)
        print(json.dumps(report["counts"], ensure_ascii=False))
        return
    problems = []
    if report["unreviewed"]:
        problems.append(f"{len(report['unreviewed'])} TCY rows have no current decision, first: {report['unreviewed'][0]}")
    if report["orphan_decisions"]:
        problems.append(f"{len(report['orphan_decisions'])} decisions match no row, first: {report['orphan_decisions'][0]}")
    if CUSTOM_PATH.read_text(encoding="utf-8") != text:
        problems.append("custom_definitions.json is stale; run apply")
    if not REPORT_PATH.exists() or read_json(REPORT_PATH) != report:
        problems.append("tcysite_review.json is stale; run apply")
    if problems:
        raise SystemExit("\n".join(problems))
    print(json.dumps(report["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
