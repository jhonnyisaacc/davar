#!/usr/bin/env python3
"""
Normalize Delitzsch parsed word prefixes in-place.

Focus:
- Collapse adjacent duplicate prefixes in `words[].prefixes`
- Rebuild `words[].strong` prefix chain to match normalized prefixes

Default scope matches phase-1 audit books.
"""

from __future__ import annotations

import argparse
import json
import re
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

BASE_STRONG_RE = re.compile(r"^H\d+$")


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize duplicate prefixes in delitzsch/parsed")
    parser.add_argument(
        "--books",
        nargs="+",
        default=DEFAULT_BOOKS,
        help="Book folder names under data/delitzsch/parsed",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing files",
    )
    return parser.parse_args()


def chapter_sort_key(path: Path) -> int:
    try:
        return int(path.stem)
    except ValueError:
        return 10**9


def iter_files(parsed_dir: Path, books: Iterable[str]) -> Iterable[Path]:
    for book in books:
        book_dir = parsed_dir / book
        if not book_dir.exists() or not book_dir.is_dir():
            continue
        for chapter_file in sorted(book_dir.glob("*.json"), key=chapter_sort_key):
            yield chapter_file


def normalize_prefixes(prefixes: Optional[List[str]]) -> List[str]:
    if not prefixes:
        return []

    normalized: List[str] = []
    for prefix in prefixes:
        if not normalized or normalized[-1] != prefix:
            normalized.append(prefix)

    return normalized[:2]


def split_strong(strong: Optional[str]) -> Tuple[List[str], Optional[str]]:
    if not strong or not isinstance(strong, str):
        return [], strong

    parts = [segment.strip() for segment in strong.split("/") if segment.strip()]
    if not parts:
        return [], strong

    if BASE_STRONG_RE.match(parts[-1]):
        return parts[:-1], parts[-1]

    return [], strong


def rebuild_strong(base_strong: Optional[str], prefixes: List[str]) -> Optional[str]:
    if not base_strong:
        return None
    if not isinstance(base_strong, str):
        return base_strong

    if not BASE_STRONG_RE.match(base_strong):
        return base_strong

    if not prefixes:
        return base_strong

    return f"{'/'.join(prefixes)}/{base_strong}"


def normalize_word(word: Dict[str, Any]) -> bool:
    changed = False

    raw_prefixes = word.get("prefixes")
    prefixes = raw_prefixes if isinstance(raw_prefixes, list) else []
    normalized = normalize_prefixes(prefixes)

    if normalized != prefixes:
        word["prefixes"] = normalized
        changed = True

    strong = word.get("strong")
    strong_prefixes, base_strong = split_strong(strong)

    if BASE_STRONG_RE.match(base_strong or ""):
        rebuilt = rebuild_strong(base_strong, normalized)
        if rebuilt != strong:
            word["strong"] = rebuilt
            changed = True
    else:
        if strong_prefixes:
            rebuilt = rebuild_strong(base_strong, normalized)
            if rebuilt != strong:
                word["strong"] = rebuilt
                changed = True

    return changed


def process_file(path: Path, dry_run: bool) -> Tuple[bool, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    file_changed = False
    word_changes = 0

    if isinstance(data, list):
        for chapter_blob in data:
            verses = chapter_blob.get("verses", [])
            if not isinstance(verses, list):
                continue
            for verse_blob in verses:
                words = verse_blob.get("words", [])
                if not isinstance(words, list):
                    continue
                for word in words:
                    if not isinstance(word, dict):
                        continue
                    if normalize_word(word):
                        file_changed = True
                        word_changes += 1

    if file_changed and not dry_run:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return file_changed, word_changes


def main() -> int:
    args = parse_args()
    root = project_root()
    parsed_dir = root / "data" / "delitzsch" / "parsed"

    changed_files = 0
    changed_words = 0

    for file_path in iter_files(parsed_dir, args.books):
        file_changed, word_changes = process_file(file_path, dry_run=args.dry_run)
        if file_changed:
            changed_files += 1
            changed_words += word_changes
            print(f"updated: {file_path} (words: {word_changes})")

    mode = "DRY RUN" if args.dry_run else "WRITE"
    print(f"[{mode}] changed files: {changed_files}, changed words: {changed_words}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
