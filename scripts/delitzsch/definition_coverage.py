"""Definition coverage for Delitzsch lexical identities, separate from mapping coverage.

write: regenerate the committed report.
check: fail when the committed report is stale, an identifier has no lexicon entry,
a custom D entry has no publication status, or a definition gap is missing from or
stale in the shrink-only baseline. A custom entry that is not approved is excluded
from publication and reported as unpublished, not as a gap.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARSED = ROOT / "data/delitzsch/parsed"
LEXICON = ROOT / "data/dict/lexicon"
REPORT = ROOT / "data/delitzsch/review/reports/definition_coverage.json"
BASELINE = ROOT / "data/delitzsch/review/definition_gaps_baseline.json"
LANGUAGES = ("en", "es")
IDENTIFIER = re.compile(r"[HD]\d+")
TEXT_KEYS = {"en": ("text_en", "text"), "es": ("text_es",)}
SPEC = json.loads((ROOT / "shared/customEntryPublication.json").read_text(encoding="utf-8"))


def encoded(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def occurrence_counts(parsed: Path = PARSED) -> Counter:
    counts: Counter = Counter()
    for path in sorted(parsed.glob("*/*.json")):
        if not path.stem.isdigit():
            continue
        for chapter in json.loads(path.read_text(encoding="utf-8")):
            for verse in chapter["verses"]:
                for word in verse.get("words", []):
                    identifier = (word.get("strong") or "").split("/")[-1]
                    if IDENTIFIER.fullmatch(identifier):
                        counts[identifier] += 1
    return counts


def load_lexicon(lexicon: Path = LEXICON) -> dict[str, dict]:
    return {name: json.loads((lexicon / f"{name}.json").read_text(encoding="utf-8")) for name in ("words", "roots", "custom_definitions")}


def has_text(definitions: list[dict], language: str) -> bool:
    return any((definition.get(key) or "").strip() for definition in definitions for key in TEXT_KEYS[language])


def classify(identifier: str, sources: dict[str, dict]) -> dict | None:
    canonical = sources["words"].get(identifier) or sources["roots"].get(identifier)
    custom = sources["custom_definitions"].get(identifier)
    if not canonical and not custom:
        return None
    status = ((custom or {}).get("publication") or {}).get("status")
    published = custom if status in (None, SPEC["published"]) else None
    definitions = [*((published or {}).get("definitions") or []), *((canonical or {}).get("definitions") or [])]
    source = "canonical_and_custom" if canonical and custom else "canonical" if canonical else "custom"
    record = {"source": source, "languages": [language for language in LANGUAGES if has_text(definitions, language)]}
    return {**record, "status": status} if status else record


def build_report(counts: Counter, sources: dict[str, dict]) -> dict:
    identifiers = {}
    missing_entries = []
    unpublished = []
    gaps: dict[str, list[dict]] = {language: [] for language in LANGUAGES}
    for identifier in sorted(counts):
        record = classify(identifier, sources)
        if record is None:
            missing_entries.append({"strong": identifier, "occurrences": counts[identifier]})
            continue
        identifiers[identifier] = {**record, "occurrences": counts[identifier]}
        if record.get("status", SPEC["published"]) != SPEC["published"]:
            unpublished.append({"strong": identifier, "status": record["status"], "occurrences": counts[identifier]})
            if record["source"] == "custom":
                continue
        for language in LANGUAGES:
            if language not in record["languages"]:
                gaps[language].append({"strong": identifier, "source": record["source"], "occurrences": counts[identifier]})
    return {
        "schema_version": 2,
        "method": "delitzsch_definition_coverage_v2",
        "languages": list(LANGUAGES),
        "totals": {
            "identifiers": len(counts),
            "occurrences": sum(counts.values()),
            "by_source": dict(sorted(Counter(record["source"] for record in identifiers.values()).items())),
            "by_status": dict(sorted(Counter(record["status"] for record in identifiers.values() if "status" in record).items())),
            "missing_entries": len(missing_entries),
            "unpublished": {"identifiers": len(unpublished), "occurrences": sum(row["occurrences"] for row in unpublished)},
            "missing_definitions": {
                language: {"identifiers": len(rows), "occurrences": sum(row["occurrences"] for row in rows)} for language, rows in gaps.items()
            },
        },
        "missing_entries": missing_entries,
        "unpublished": unpublished,
        "missing_definitions": gaps,
        "identifiers": identifiers,
    }


def gap_ids(report: dict) -> dict[str, list[str]]:
    return {language: [row["strong"] for row in rows] for language, rows in report["missing_definitions"].items()}


def check_errors(report: dict, committed: str | None, baseline: dict[str, list[str]]) -> list[str]:
    errors = []
    if committed != encoded(report):
        errors.append(f"{REPORT.relative_to(ROOT)} is stale; run python -m scripts.delitzsch.definition_coverage write")
    for row in report["missing_entries"]:
        errors.append(f"{row['strong']} has no lexicon entry ({row['occurrences']} occurrences)")
    for strong, record in report["identifiers"].items():
        if strong.startswith("D") and record.get("status") not in SPEC["statuses"]:
            errors.append(f"{strong} has no valid publication status; run python -m scripts.delitzsch.entry_publication write")
    for language, current in gap_ids(report).items():
        allowed = set(baseline.get(language, []))
        for strong in sorted(set(current) - allowed):
            errors.append(f"{strong} has no {language} definition; add one, or route a wrong identity to #159")
        for strong in sorted(allowed - set(current)):
            errors.append(f"{strong} now has a {language} definition; remove it from {BASELINE.relative_to(ROOT)}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["write", "check"])
    args = parser.parse_args(argv)
    report = build_report(occurrence_counts(), load_lexicon())
    if args.command == "write":
        REPORT.write_text(encoded(report), encoding="utf-8")
        print(json.dumps(report["totals"], indent=2))
        return 0
    committed = REPORT.read_text(encoding="utf-8") if REPORT.exists() else None
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    errors = check_errors(report, committed, baseline)
    for error in errors:
        print(error)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
