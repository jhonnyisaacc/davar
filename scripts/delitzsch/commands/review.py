"""Delitzsch Strong's review workflow command implementation."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

if __package__ in (None, ""):
    scripts_dir = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(scripts_dir))
    from delitzsch.review import workflow
else:
    from ..review import workflow


def register_subcommand(subparsers: argparse._SubParsersAction) -> argparse.ArgumentParser:
    parser = subparsers.add_parser(
        "review",
        help="Scan, batch, apply, and report Delitzsch Strong's review work",
    )
    review_subparsers = parser.add_subparsers(dest="review_command", required=True)

    scan = review_subparsers.add_parser("scan", help="Scan parsed Delitzsch files for review issues")
    add_common_scan_args(scan)
    scan.add_argument(
        "--output",
        default="data/delitzsch/review/scan.json",
        help="Output JSON path relative to project root",
    )
    scan.set_defaults(handler=handle_scan)

    batch = review_subparsers.add_parser("batch", help="Generate a small editable review batch")
    add_common_scan_args(batch)
    batch.add_argument("--limit", type=int, default=50, help="Maximum decisions in the batch")
    batch.add_argument(
        "--all",
        action="store_true",
        help="Write all matching issues into numbered batch files",
    )
    batch.add_argument(
        "--output-dir",
        default="data/delitzsch/review/batches",
        help="Output directory for --all, relative to project root",
    )
    batch.add_argument(
        "--issue-types",
        nargs="+",
        help="Restrict batch to these issue types",
    )
    batch.add_argument(
        "--output",
        help="Output JSON path. Defaults to data/delitzsch/review/batches/<timestamp>.json",
    )
    batch.set_defaults(handler=handle_batch)

    apply_parser = review_subparsers.add_parser("apply", help="Apply decisions from a review batch")
    apply_parser.add_argument("decisions_file", help="Review batch/decision JSON file")
    apply_parser.add_argument("--dry-run", action="store_true", help="Validate without writing files")
    apply_parser.set_defaults(handler=handle_apply)

    report = review_subparsers.add_parser("report", help="Print review summary")
    add_common_scan_args(report)
    report.set_defaults(handler=handle_report)

    return parser


def add_common_scan_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--books",
        nargs="+",
        help="Book folder names under data/delitzsch/parsed",
    )
    parser.add_argument(
        "--no-suspicious",
        action="store_true",
        help="Skip invalid/missing Strong reference checks",
    )
    parser.add_argument(
        "--include-lemma-mismatch",
        action="store_true",
        help="Include noisy normalized lemma-overlap checks for existing assignments",
    )
    parser.add_argument(
        "--include-definition-review",
        action="store_true",
        help="Add one definition-review item per unique lexicon key used in parsed Delitzsch",
    )


def make_context() -> tuple[Path, Path, workflow.LexiconIndex, Path]:
    root = workflow.project_root()
    parsed = workflow.parsed_dir(root)
    lexicon = workflow.LexiconIndex(workflow.lexicon_words_dir(root))
    review = workflow.review_dir(root)
    return root, parsed, lexicon, review


def collect_issues(args: argparse.Namespace) -> list[workflow.ReviewIssue]:
    _, parsed, lexicon, _ = make_context()
    return workflow.scan_issues(
        parsed,
        lexicon,
        books=args.books,
        include_suspicious=not args.no_suspicious,
        include_lemma_mismatch=args.include_lemma_mismatch,
        include_definition_review=args.include_definition_review,
    )


def handle_scan(args: argparse.Namespace) -> int:
    root, _, _, review = make_context()
    issues = collect_issues(args)
    latest = workflow.load_latest_decisions(review / "decisions")
    remaining, reviewed = workflow.partition_reviewed_issues(issues, latest)
    summary = {
        "remaining_issues": workflow.summarize_issues(remaining),
        "reviewed_issues": workflow.summarize_reviewed_issues(reviewed),
        "scan_flags": workflow.summarize_issues(issues),
    }
    output_path = root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "summary": summary,
        "issues": [
            {
                **asdict(issue),
                "review_status": workflow.issue_review_status(issue, latest),
                "review_action": (latest.get(issue.occurrence.key) or {}).get("action"),
            }
            for issue in issues
        ],
    }
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Scan written to {output_path}")
    return 0


def handle_batch(args: argparse.Namespace) -> int:
    root, _, _, review = make_context()
    issues = collect_issues(args)
    latest = workflow.load_latest_decisions(review / "decisions")
    issues, _ = workflow.partition_reviewed_issues(issues, latest)
    issue_types = set(args.issue_types) if args.issue_types else None

    if args.all:
        batches = workflow.generate_batches(
            issues,
            chunk_size=args.limit,
            issue_types=issue_types,
        )
        output_dir = root / args.output_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        for index, batch in enumerate(batches, start=1):
            output_path = output_dir / f"batch_{index:04d}.json"
            with output_path.open("w", encoding="utf-8") as handle:
                json.dump(batch, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
        print(f"Batch files written: {len(batches)}")
        print(f"Output directory: {output_dir}")
        return 0

    batch = workflow.generate_batch(
        issues,
        limit=args.limit,
        issue_types=issue_types,
    )
    if args.output:
        output_path = root / args.output
    else:
        stamp = batch["created_at"].replace(":", "").replace("+", "Z")
        output_path = review / "batches" / f"batch_{stamp}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(batch, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Batch decisions: {len(batch['decisions'])}")
    print(f"Batch written to {output_path}")
    return 0


def handle_apply(args: argparse.Namespace) -> int:
    root, parsed, lexicon, review = make_context()
    decisions_file = resolve_decisions_file(args.decisions_file, root, review)
    stats = workflow.apply_decisions(
        decisions_file=decisions_file,
        base_dir=parsed,
        lexicon=lexicon,
        log_dir=review / "decisions",
        dry_run=args.dry_run,
    )
    print(json.dumps(asdict(stats), ensure_ascii=False, indent=2))
    return 1 if stats.errors else 0


def resolve_decisions_file(value: str, root: Path, review: Path) -> Path:
    """Resolve batch paths from absolute, cwd/root-relative, or batch basename."""

    raw = Path(value)
    candidates = [
        raw,
        root / raw,
        review / "batches" / raw.name,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    batch_dir = review / "batches"
    if batch_dir.exists():
        matches = sorted(batch_dir.glob(f"{raw.stem}*.json"))
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            names = ", ".join(path.name for path in matches[:5])
            raise FileNotFoundError(
                f"Ambiguous batch name {value!r}; matches: {names}"
            )

    raise FileNotFoundError(
        f"Decision file not found: {value}. Try data/delitzsch/review/batches/{raw.name}"
    )


def handle_report(args: argparse.Namespace) -> int:
    _, _, _, review = make_context()
    issues = collect_issues(args)
    latest = workflow.load_latest_decisions(review / "decisions")
    remaining, reviewed = workflow.partition_reviewed_issues(issues, latest)
    payload = {
        "remaining_issues": workflow.summarize_issues(remaining),
        "reviewed_issues": workflow.summarize_reviewed_issues(reviewed),
        "scan_flags": workflow.summarize_issues(issues),
        "decision_logs": workflow.summarize_decision_logs(review / "decisions"),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0
