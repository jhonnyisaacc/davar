#!/usr/bin/env python3
"""
Audit Delitzsch parsed output for high-confidence prefix/strong anomalies.

Phase-1 default scope:
- acts
- thessalonians1
- thessalonians2
- timothy1
- timothy2
- titus

Checks:
1) duplicate_identical_prefixes
2) prefix_count_anomalies
3) strong_prefix_mismatch
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


DEFAULT_BOOKS = [
    "acts",
    "thessalonians1",
    "thessalonians2",
    "timothy1",
    "timothy2",
    "titus",
]

KNOWN_PREFIXES = {
    "Ha",
    "Hb",
    "Hc",
    "Hd",
    "He",
    "Hf",
    "Hg",
    "Hh",
    "Hi",
    "Hj",
    "Hk",
    "Hl",
    "Hm",
    "Hn",
    "Ho",
    "Hp",
    "Hq",
    "Hr",
    "Hs",
    "Ht",
    "Hu",
    "Hv",
    "Hw",
    "Hx",
    "Hy",
    "Hz",
    "HR",
}

STRONG_BASE_RE = re.compile(r"^H\d+$")


@dataclass
class Finding:
    anomaly_type: str
    book: str
    chapter_file: str
    chapter: int
    verse: int
    word_index: int
    text: str
    strong: Optional[str]
    prefixes: List[str]
    strong_prefixes: List[str]
    reason: str


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit Delitzsch parsed output for prefix/strong anomalies"
    )
    parser.add_argument(
        "--books",
        nargs="+",
        default=DEFAULT_BOOKS,
        help="Book folder names under data/delitzsch/parsed",
    )
    parser.add_argument(
        "--output-dir",
        default="debug/output/delitzsch_audit",
        help="Output directory relative to project root",
    )
    parser.add_argument(
        "--max-examples",
        type=int,
        default=75,
        help="Max examples per anomaly type in markdown report",
    )
    return parser.parse_args()


def chapter_sort_key(path: Path) -> int:
    try:
        return int(path.stem)
    except ValueError:
        return 10**9


def iter_scoped_files(parsed_dir: Path, books: Iterable[str]) -> Iterable[Tuple[str, Path]]:
    for book in books:
        book_dir = parsed_dir / book
        if not book_dir.exists() or not book_dir.is_dir():
            continue
        for chapter_file in sorted(book_dir.glob("*.json"), key=chapter_sort_key):
            yield book, chapter_file


def extract_strong_prefixes(strong: Optional[str]) -> List[str]:
    if not strong or not isinstance(strong, str):
        return []

    parts = [segment.strip() for segment in strong.split("/") if segment.strip()]
    if not parts:
        return []

    if STRONG_BASE_RE.match(parts[-1]):
        return parts[:-1]

    return []


def duplicate_prefixes(prefixes: List[str]) -> bool:
    if len(prefixes) < 2:
        return False
    return any(left == right for left, right in zip(prefixes, prefixes[1:]))


def prefix_count_anomaly(prefixes: List[str], strong_prefixes: List[str]) -> Optional[str]:
    if len(prefixes) > 2:
        return f"prefixes array has {len(prefixes)} entries (>2)"

    if len(strong_prefixes) > 2:
        return f"strong encodes {len(strong_prefixes)} prefixes (>2)"

    unknown = [prefix for prefix in prefixes if prefix not in KNOWN_PREFIXES]
    if unknown:
        return f"unknown prefix codes in array: {unknown}"

    unknown_strong = [prefix for prefix in strong_prefixes if prefix not in KNOWN_PREFIXES]
    if unknown_strong:
        return f"unknown prefix codes in strong: {unknown_strong}"

    return None


def strong_prefix_mismatch(prefixes: List[str], strong_prefixes: List[str], strong: Optional[str]) -> Optional[str]:
    if not strong or not isinstance(strong, str):
        return None

    if not strong_prefixes and not prefixes:
        return None

    if strong_prefixes != prefixes:
        return f"strong prefixes {strong_prefixes} != prefixes array {prefixes}"

    return None


def collect_findings(parsed_dir: Path, books: List[str]) -> List[Finding]:
    findings: List[Finding] = []

    for book, chapter_file in iter_scoped_files(parsed_dir, books):
        with chapter_file.open("r", encoding="utf-8") as handle:
            data = json.load(handle)

        if not isinstance(data, list):
            continue

        for chapter_blob in data:
            verses = chapter_blob.get("verses", [])
            for verse_blob in verses:
                chapter = verse_blob.get("chapter")
                verse = verse_blob.get("verse")
                words = verse_blob.get("words", [])
                if not isinstance(words, list):
                    continue

                for idx, word in enumerate(words):
                    if not isinstance(word, dict):
                        continue

                    text = word.get("text") or ""
                    strong = word.get("strong")
                    prefixes = word.get("prefixes") or []
                    if not isinstance(prefixes, list):
                        prefixes = []

                    strong_prefixes = extract_strong_prefixes(strong)

                    if duplicate_prefixes(prefixes):
                        findings.append(
                            Finding(
                                anomaly_type="duplicate_identical_prefixes",
                                book=book,
                                chapter_file=chapter_file.name,
                                chapter=int(chapter or 0),
                                verse=int(verse or 0),
                                word_index=idx,
                                text=text,
                                strong=strong,
                                prefixes=prefixes,
                                strong_prefixes=strong_prefixes,
                                reason="adjacent identical prefixes in prefixes array",
                            )
                        )

                    count_reason = prefix_count_anomaly(prefixes, strong_prefixes)
                    if count_reason:
                        findings.append(
                            Finding(
                                anomaly_type="prefix_count_anomalies",
                                book=book,
                                chapter_file=chapter_file.name,
                                chapter=int(chapter or 0),
                                verse=int(verse or 0),
                                word_index=idx,
                                text=text,
                                strong=strong,
                                prefixes=prefixes,
                                strong_prefixes=strong_prefixes,
                                reason=count_reason,
                            )
                        )

                    mismatch_reason = strong_prefix_mismatch(prefixes, strong_prefixes, strong)
                    if mismatch_reason:
                        findings.append(
                            Finding(
                                anomaly_type="strong_prefix_mismatch",
                                book=book,
                                chapter_file=chapter_file.name,
                                chapter=int(chapter or 0),
                                verse=int(verse or 0),
                                word_index=idx,
                                text=text,
                                strong=strong,
                                prefixes=prefixes,
                                strong_prefixes=strong_prefixes,
                                reason=mismatch_reason,
                            )
                        )

    return findings


def summarize(findings: List[Finding]) -> Dict[str, Any]:
    by_type = Counter(item.anomaly_type for item in findings)
    by_book = Counter(item.book for item in findings)
    by_type_and_book: Dict[str, Counter] = defaultdict(Counter)

    for finding in findings:
        by_type_and_book[finding.anomaly_type][finding.book] += 1

    return {
        "total_findings": len(findings),
        "counts_by_type": dict(by_type),
        "counts_by_book": dict(by_book),
        "counts_by_type_and_book": {
            anomaly_type: dict(counter)
            for anomaly_type, counter in by_type_and_book.items()
        },
    }


def findings_to_markdown(
    findings: List[Finding],
    summary: Dict[str, Any],
    books: List[str],
    max_examples: int,
) -> str:
    lines: List[str] = []

    lines.append("# Delitzsch Parsing Audit (Phase 1)")
    lines.append("")
    lines.append("## Scope")
    lines.append(f"- Books: {', '.join(books)}")
    lines.append("- Checks: duplicate_identical_prefixes, prefix_count_anomalies, strong_prefix_mismatch")
    lines.append("")

    lines.append("## Summary")
    lines.append(f"- Total findings: {summary['total_findings']}")
    for anomaly_type, count in summary["counts_by_type"].items():
        lines.append(f"- {anomaly_type}: {count}")
    lines.append("")

    for anomaly_type in [
        "duplicate_identical_prefixes",
        "prefix_count_anomalies",
        "strong_prefix_mismatch",
    ]:
        typed = [item for item in findings if item.anomaly_type == anomaly_type]
        lines.append(f"## {anomaly_type}")
        lines.append(f"- Count: {len(typed)}")

        by_book = Counter(item.book for item in typed)
        if by_book:
            ordered = ", ".join(f"{book}: {count}" for book, count in by_book.most_common())
            lines.append(f"- By book: {ordered}")
        else:
            lines.append("- By book: none")
        lines.append("")

        if not typed:
            lines.append("No findings.")
            lines.append("")
            continue

        lines.append("Top examples:")
        lines.append("")
        lines.append("| Ref | Word | Strong | Prefixes | Strong Prefixes | Reason |")
        lines.append("|---|---|---|---|---|---|")
        for item in typed[:max_examples]:
            ref = f"{item.book} {item.chapter}:{item.verse} (w{item.word_index})"
            strong = item.strong if item.strong is not None else "null"
            prefixes = ", ".join(item.prefixes) if item.prefixes else "[]"
            strong_prefixes = ", ".join(item.strong_prefixes) if item.strong_prefixes else "[]"
            reason = item.reason.replace("|", "\\|")
            word = item.text.replace("|", "\\|")
            lines.append(f"| {ref} | {word} | {strong} | {prefixes} | {strong_prefixes} | {reason} |")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def main() -> int:
    args = parse_args()

    root = project_root()
    parsed_dir = root / "data" / "delitzsch" / "parsed"
    output_dir = root / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    findings = collect_findings(parsed_dir, args.books)
    summary = summarize(findings)

    findings_path = output_dir / "phase1_findings.json"
    summary_path = output_dir / "phase1_summary.json"
    report_path = output_dir / "phase1_report.md"

    with findings_path.open("w", encoding="utf-8") as handle:
        json.dump([asdict(item) for item in findings], handle, ensure_ascii=False, indent=2)

    with summary_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    report = findings_to_markdown(
        findings=findings,
        summary=summary,
        books=args.books,
        max_examples=args.max_examples,
    )
    report_path.write_text(report, encoding="utf-8")

    print(f"Audit complete. Findings: {len(findings)}")
    print(f"Summary: {summary_path}")
    print(f"Findings: {findings_path}")
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
