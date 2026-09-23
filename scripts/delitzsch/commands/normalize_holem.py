"""Normalize Delitzsch source holem encoding command implementation."""

from __future__ import annotations

import argparse

from .. import normalize_delitzsch_holem as normalizer


def register_subcommand(subparsers: argparse._SubParsersAction) -> argparse.ArgumentParser:
    parser = subparsers.add_parser(
        "normalize-holem",
        help="Normalize corrupted sin dots in Delitzsch source text",
    )
    parser.add_argument(
        "--books",
        nargs="+",
        default=normalizer.DEFAULT_BOOKS,
        help="Book JSON names under data/delitzsch",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing files",
    )
    parser.set_defaults(handler=handle)
    return parser


def handle(args: argparse.Namespace) -> int:
    return normalizer.main(
        ["--dry-run", "--books", *args.books]
        if args.dry_run
        else ["--books", *args.books]
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Normalize corrupted sin dots in Delitzsch source text",
    )
    parser.add_argument(
        "--books",
        nargs="+",
        default=normalizer.DEFAULT_BOOKS,
        help="Book JSON names under data/delitzsch",
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
