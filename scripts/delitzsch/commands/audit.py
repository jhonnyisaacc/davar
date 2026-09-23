"""Audit Delitzsch parsed output command implementation."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

if __package__ in (None, ""):
    scripts_dir = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(scripts_dir))
    from delitzsch import audit_delitzsch_parsing as auditor
else:
    from .. import audit_delitzsch_parsing as auditor


def register_subcommand(subparsers: argparse._SubParsersAction) -> argparse.ArgumentParser:
    parser = subparsers.add_parser(
        "audit",
        help="Audit parsed Delitzsch output for prefix/strong anomalies",
    )
    parser.add_argument(
        "--books",
        nargs="+",
        default=auditor.DEFAULT_BOOKS,
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
    parser.set_defaults(handler=handle)
    return parser


def handle(args: argparse.Namespace) -> int:
    root = auditor.project_root()
    parsed_dir = root / "data" / "delitzsch" / "parsed"
    output_dir = root / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    findings = auditor.collect_findings(parsed_dir, args.books)
    summary = auditor.summarize(findings)

    findings_path = output_dir / "phase1_findings.json"
    summary_path = output_dir / "phase1_summary.json"
    report_path = output_dir / "phase1_report.md"

    with findings_path.open("w", encoding="utf-8") as handle_file:
        json.dump([asdict(item) for item in findings],
                  handle_file, ensure_ascii=False, indent=2)

    with summary_path.open("w", encoding="utf-8") as handle_file:
        json.dump(summary, handle_file, ensure_ascii=False, indent=2)

    report = auditor.findings_to_markdown(
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Audit Delitzsch parsed output for prefix/strong anomalies",
    )
    parser.add_argument(
        "--books",
        nargs="+",
        default=auditor.DEFAULT_BOOKS,
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
    args = parser.parse_args(argv)
    return handle(args)


if __name__ == "__main__":
    raise SystemExit(main())
