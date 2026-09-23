"""Normalize Delitzsch parsed prefix chains command implementation."""

from __future__ import annotations

import argparse

from .. import normalize_delitzsch_prefixes as normalizer


def register_subcommand(subparsers: argparse._SubParsersAction) -> argparse.ArgumentParser:
    parser = subparsers.add_parser(
        "normalize",
        help="Normalize duplicate prefixes in parsed Delitzsch output",
    )
    parser.add_argument(
        "--books",
        nargs="+",
        default=normalizer.DEFAULT_BOOKS,
        help="Book folder names under data/delitzsch/parsed",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing files",
    )
    parser.set_defaults(handler=handle)
    return parser


def handle(args: argparse.Namespace) -> int:
    root = normalizer.project_root()
    parsed_dir = root / "data" / "delitzsch" / "parsed"

    changed_files = 0
    changed_words = 0

    for file_path in normalizer.iter_files(parsed_dir, args.books):
        file_changed, word_changes = normalizer.process_file(
            file_path, dry_run=args.dry_run)
        if file_changed:
            changed_files += 1
            changed_words += word_changes
            print(f"updated: {file_path} (words: {word_changes})")

    mode = "DRY RUN" if args.dry_run else "WRITE"
    print(f"[{mode}] changed files: {changed_files}, changed words: {changed_words}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Normalize duplicate prefixes in delitzsch/parsed",
    )
    parser.add_argument(
        "--books",
        nargs="+",
        default=normalizer.DEFAULT_BOOKS,
        help="Book folder names under data/delitzsch/parsed",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing files",
    )
    args = parser.parse_args(argv)
    return handle(args)


if __name__ == "__main__":
    raise SystemExit(main())
