"""Run Delitzsch matcher command implementation."""

from __future__ import annotations

import argparse
import logging

from .. import matcher_runner as matcher
from ..config import OUTPUT_DIR, ensure_output_dirs
from ..sqlite_loader import get_sqlite_loader


def register_subcommand(subparsers: argparse._SubParsersAction) -> argparse.ArgumentParser:
    parser = subparsers.add_parser(
        "run",
        help="Process Delitzsch books from SQLite into parsed JSON output",
    )
    parser.add_argument(
        "--book",
        type=str,
        help="Process specific book by name (e.g., acts, matthew, john1)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be done without writing files",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output",
    )
    parser.set_defaults(handler=handle)
    return parser


def handle(args: argparse.Namespace) -> int:
    matcher.setup_logging(args.verbose)

    if args.dry_run:
        print("DRY RUN MODE - No files will be written")

    if args.book:
        loader = get_sqlite_loader()
        available_books = loader.get_all_books()
        book_names = [name for _, name in available_books]

        if args.book not in book_names:
            print(f"Book '{args.book}' not found. Available books:")
            for name in sorted(book_names):
                print(f"  {name}")
            return 1

        if not args.dry_run:
            output_book_dir = OUTPUT_DIR / args.book
            output_book_dir.mkdir(parents=True, exist_ok=True)

        success = matcher.process_book(args.book, args.dry_run, args.verbose)
        return 0 if success else 1

    if not args.dry_run:
        ensure_output_dirs()

    return matcher.process_all_books(args.dry_run, args.verbose)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Delitzsch Strong's Matcher - Match Hebrew words to Strong's numbers",
    )
    parser.add_argument(
        "--book",
        type=str,
        help="Process specific book by name (e.g., acts, matthew, john1)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be done without writing files",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output",
    )
    args = parser.parse_args(argv)
    return handle(args)


if __name__ == "__main__":
    raise SystemExit(main())
