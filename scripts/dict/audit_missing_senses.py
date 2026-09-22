#!/usr/bin/env python3
"""Audit lexicon entries that are missing BDB senses from LexicalIndex.

This is intentionally read-only. Issue #18 defers adding the missing
definitions until the transliteration strategy is finalized, so this script
produces inventory reports instead of patching lexicon JSON files.

Usage:
    python -m scripts.dict.audit_missing_senses
    python -m scripts.dict.audit_missing_senses --json-out debug/output/missing_bdb_senses.json
    python -m scripts.dict.audit_missing_senses --markdown-out docs/lexicon-missing-bdb-senses.md
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.dict.config import config

LI_NS = {"li": "http://openscriptures.github.com/morphhb/namespace"}


def normalize_gloss(text: str) -> str:
    """Normalize a gloss for loose comparison."""
    text = text.lower().strip()
    text = re.sub(r"\([^)]*\)", "", text)
    text = re.sub(r"[^a-z0-9&;, ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" ;,")


def gloss_matches(needle: str, haystack: set[str]) -> bool:
    """Return whether a source gloss is already represented locally."""
    normalized = normalize_gloss(needle)
    if not normalized:
        return False

    for existing in haystack:
        current = normalize_gloss(existing)
        if not current:
            continue
        if normalized == current:
            return True
        if normalized in current or current in normalized:
            return True

        needle_parts = {part.strip() for part in re.split(r"[,;]", normalized) if part.strip()}
        current_parts = {part.strip() for part in re.split(r"[,;]", current) if part.strip()}
        if needle_parts and current_parts and needle_parts <= current_parts:
            return True

    return False


def load_lexical_index_senses() -> dict[str, list[dict[str, str]]]:
    """Load distinct BDB mappings per Strong's number from LexicalIndex."""
    tree = ET.parse(config.LEXICAL_INDEX)
    root = tree.getroot()
    strong_bdb_map: dict[str, list[dict[str, str]]] = defaultdict(list)
    seen: set[tuple[str, str, str]] = set()

    for entry in root.findall(".//li:entry", LI_NS):
        xref = entry.find("li:xref", LI_NS)
        if xref is None:
            continue

        strong = xref.get("strong")
        bdb_id = xref.get("bdb", "")
        if not strong or not bdb_id:
            continue

        def_elem = entry.find("li:def", LI_NS)
        pos_elem = entry.find("li:pos", LI_NS)
        gloss = def_elem.text.strip() if def_elem is not None and def_elem.text else ""
        pos = pos_elem.text.strip() if pos_elem is not None and pos_elem.text else ""
        strong_key = f"H{strong}"
        dedupe_key = (strong_key, bdb_id, normalize_gloss(gloss))
        if dedupe_key in seen:
            continue

        seen.add(dedupe_key)
        strong_bdb_map[strong_key].append(
            {
                "bdb_id": bdb_id,
                "aug": xref.get("aug", ""),
                "gloss": gloss,
                "pos": pos,
            }
        )

    return strong_bdb_map


def load_lexicon_entries() -> dict[str, dict[str, Any]]:
    """Load current word/root lexicon entries."""
    entries: dict[str, dict[str, Any]] = {}
    for directory in (config.LEXICON_WORDS_DIR, config.LEXICON_ROOTS_DIR):
        for path in sorted(directory.glob("H*.json")):
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)

            strong = data.get("strong_number", path.stem)
            definitions = data.get("definitions", [])
            entries[strong] = {
                "strong": strong,
                "lemma": data.get("lemma", ""),
                "translit_en": data.get("translit_en", ""),
                "translit_es": data.get("translit_es", ""),
                "file": str(path.relative_to(PROJECT_ROOT)),
                "definitions": definitions,
                "glosses": {
                    definition.get("text_en", "").strip()
                    for definition in definitions
                    if definition.get("text_en", "").strip()
                },
            }

    return entries


def bani_transliteration(lemma: str, strong: str) -> dict[str, str]:
    """Attempt Bani transliteration for a Hebrew lemma."""
    if not lemma:
        return {"en": "", "es": ""}

    try:
        from tools.bani.apply import Transliterator, load_jsonc

        schema_dir = PROJECT_ROOT / "tools" / "bani" / "schemas"
        guides: dict[str, str] = {}
        for language in ("en", "es"):
            if not lemma.strip():
                guides[language] = ""
                continue
            engine = Transliterator(load_jsonc(schema_dir / f"{language}.json"))
            guides[language] = engine.transliterate_word(lemma, strong).get("guide", "")
        return guides
    except Exception:
        return {"en": "", "es": ""}


def build_report(limit_transliteration: int | None = None) -> dict[str, Any]:
    """Build the full read-only audit report."""
    li_senses = load_lexical_index_senses()
    lexicon = load_lexicon_entries()
    entries: list[dict[str, Any]] = []

    for strong, source_senses in li_senses.items():
        lex_entry = lexicon.get(strong)
        if not lex_entry:
            continue

        candidate_senses = [
            sense
            for sense in source_senses
            if sense["gloss"] and sense["pos"] != "Np"
        ]
        if len(candidate_senses) <= 1:
            continue

        current_glosses = lex_entry["glosses"]
        missing = [
            sense
            for sense in candidate_senses
            if not gloss_matches(sense["gloss"], current_glosses)
        ]
        if not missing:
            continue

        entries.append(
            {
                "strong_number": strong,
                "lemma": lex_entry["lemma"],
                "file": lex_entry["file"],
                "current_definition_count": len(lex_entry["definitions"]),
                "source_sense_count": len(candidate_senses),
                "missing_definition_count": len(missing),
                "current_glosses": sorted(current_glosses),
                "missing_glosses": missing,
                "existing_translit_en": lex_entry["translit_en"],
                "existing_translit_es": lex_entry["translit_es"],
            }
        )

    entries.sort(
        key=lambda item: (
            -item["missing_definition_count"],
            int(item["strong_number"][1:]) if item["strong_number"][1:].isdigit() else 0,
        )
    )

    transliteration_attempted = 0
    transliteration_auto = 0
    for entry in entries:
        should_attempt = limit_transliteration is None or transliteration_attempted < limit_transliteration
        generated = bani_transliteration(entry["lemma"], entry["strong_number"]) if should_attempt else {"en": "", "es": ""}
        can_auto = bool(generated["en"] and generated["es"])
        if should_attempt:
            transliteration_attempted += len(entry["missing_glosses"])
            transliteration_auto += len(entry["missing_glosses"]) if can_auto else 0

        entry["transliteration"] = {
            "strategy": "reuse lemma-level translit_en/translit_es for any future added definitions",
            "existing_complete": bool(entry["existing_translit_en"] and entry["existing_translit_es"]),
            "bani_generated_en": generated["en"],
            "bani_generated_es": generated["es"],
            "can_auto_transliterate": can_auto,
        }

    bucket_counts = Counter(
        "1" if entry["missing_definition_count"] == 1
        else "2" if entry["missing_definition_count"] == 2
        else "3+"
        for entry in entries
    )

    return {
        "summary": {
            "lexical_index_strong_count": len(li_senses),
            "lexicon_entry_count": len(lexicon),
            "affected_entry_count": len(entries),
            "missing_definition_total": sum(entry["missing_definition_count"] for entry in entries),
            "missing_definition_buckets": {
                "1": bucket_counts.get("1", 0),
                "2": bucket_counts.get("2", 0),
                "3+": bucket_counts.get("3+", 0),
            },
            "transliteration_assessed_missing_glosses": transliteration_attempted,
            "transliteration_auto_missing_glosses": transliteration_auto,
            "transliteration_auto_percent": round(
                (transliteration_auto / transliteration_attempted * 100) if transliteration_attempted else 0,
                2,
            ),
            "decision": (
                "Do not backfill definitions in this phase. Future definition additions "
                "should reuse lemma-level translit_en/translit_es unless product "
                "requirements demand per-definition pronunciation fields."
            ),
        },
        "entries": entries,
    }


def write_json(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def write_markdown(report: dict[str, Any], path: Path, top: int) -> None:
    summary = report["summary"]
    rows = report["entries"][:top]
    lines = [
        "# Missing BDB Sense Audit",
        "",
        "Issue #18 tracks incomplete lexicon entries where LexicalIndex maps a Strong's number to multiple BDB senses, but the processed lexicon does not expose all of those glosses.",
        "",
        "## Summary",
        "",
        f"- LexicalIndex Strong's numbers checked: {summary['lexical_index_strong_count']}",
        f"- Lexicon entries checked: {summary['lexicon_entry_count']}",
        f"- Affected entries: {summary['affected_entry_count']}",
        f"- Missing definition glosses: {summary['missing_definition_total']}",
        f"- Entries missing 1 gloss: {summary['missing_definition_buckets']['1']}",
        f"- Entries missing 2 glosses: {summary['missing_definition_buckets']['2']}",
        f"- Entries missing 3+ glosses: {summary['missing_definition_buckets']['3+']}",
        f"- Bani auto-transliteration coverage for assessed missing glosses: {summary['transliteration_auto_percent']}%",
        "",
        "## Transliteration Decision",
        "",
        summary["decision"],
        "",
        "The missing definitions are English glosses, while `translit_en` and `translit_es` are lemma pronunciation guides. For the next phase, the lower-risk strategy is to reuse the entry's lemma-level transliteration on any new definition records instead of trying to transliterate English gloss text.",
        "",
        f"## Top {len(rows)} Affected Entries",
        "",
        "| Strong | Lemma | Missing | Missing glosses | Bani coverage | File |",
        "| --- | --- | ---: | --- | --- | --- |",
    ]

    for entry in rows:
        missing = "; ".join(
            f"{sense['gloss']} ({sense['bdb_id']})"
            for sense in entry["missing_glosses"]
        )
        coverage = "auto" if entry["transliteration"]["can_auto_transliterate"] else "manual"
        lines.append(
            f"| {entry['strong_number']} | {entry['lemma']} | {entry['missing_definition_count']} | {missing} | {coverage} | `{entry['file']}` |"
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def print_summary(report: dict[str, Any], top: int) -> None:
    summary = report["summary"]
    print("Missing BDB sense audit")
    print("=======================")
    print(f"Affected entries: {summary['affected_entry_count']}")
    print(f"Missing definition glosses: {summary['missing_definition_total']}")
    print(
        "Buckets: "
        f"1={summary['missing_definition_buckets']['1']}, "
        f"2={summary['missing_definition_buckets']['2']}, "
        f"3+={summary['missing_definition_buckets']['3+']}"
    )
    print(
        "Bani coverage: "
        f"{summary['transliteration_auto_missing_glosses']}/"
        f"{summary['transliteration_assessed_missing_glosses']} "
        f"({summary['transliteration_auto_percent']}%)"
    )
    print()
    print("Top affected entries:")
    for entry in report["entries"][:top]:
        glosses = ", ".join(sense["gloss"] for sense in entry["missing_glosses"])
        print(
            f"- {entry['strong_number']} {entry['lemma']}: "
            f"{entry['missing_definition_count']} missing ({glosses})"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", type=Path, help="Write full audit report as JSON")
    parser.add_argument("--markdown-out", type=Path, help="Write human-readable audit report as Markdown")
    parser.add_argument("--top", type=int, default=25, help="Number of entries to print/include in Markdown")
    parser.add_argument(
        "--limit-transliteration",
        type=int,
        default=None,
        help="Limit Bani transliteration attempts for fast smoke tests",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report = build_report(limit_transliteration=args.limit_transliteration)
    print_summary(report, args.top)

    if args.json_out:
        write_json(report, args.json_out)
        print(f"\nJSON report written to {args.json_out}")
    if args.markdown_out:
        write_markdown(report, args.markdown_out, args.top)
        print(f"Markdown report written to {args.markdown_out}")


if __name__ == "__main__":
    main()
