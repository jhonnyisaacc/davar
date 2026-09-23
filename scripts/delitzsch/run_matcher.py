#!/usr/bin/env python3
"""Compatibility wrapper for the legacy run matcher entrypoint."""

from __future__ import annotations


from .commands.run import main
from .matcher_runner import process_all_books, process_book, save_chapter_data, setup_logging, log_unmatched_words


if __name__ == "__main__":
    raise SystemExit(main())
