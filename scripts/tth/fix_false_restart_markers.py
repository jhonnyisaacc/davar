#!/usr/bin/env python3
"""
Repair deterministic false verse restart markers in TTH_2 markdown sources.

Targets chapter-internal non-increasing "**1** ..." lines that are known
DOCX/markdown wrap artifacts. In those cases the marker is removed and the
line is kept as continuation text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKDOWN_DIR = ROOT / "data" / "tth" / "markdown"

CHAPTER_RE = re.compile(r"^\*\*(\d+)\*\*\s*$")
VERSE_RE = re.compile(r"^\*\*(\d+)\*\*\s+(.+)$")


@dataclass
class Fix:
    book: str
    chapter: int
    line: int
    previous_verse: int
    original: str


def should_fix_false_restart(verse_num: int, previous_verse: int | None, verse_text: str) -> bool:
    if previous_verse is None or previous_verse < 1:
        return False
    if verse_num != 1:
        return False
    trimmed = verse_text.strip()
    if not trimmed:
        return False
    # Verse numbering should never restart to 1 inside a chapter after verse 1.
    return previous_verse >= 1


def process_file(path: Path) -> tuple[int, list[Fix]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    updated: list[str] = []

    chapter: int | None = None
    previous_verse: int | None = None
    fixes: list[Fix] = []

    for idx, line in enumerate(lines, start=1):
        chapter_match = CHAPTER_RE.match(line.strip())
        if chapter_match:
            chapter = int(chapter_match.group(1))
            previous_verse = None
            updated.append(line)
            continue

        verse_match = VERSE_RE.match(line)
        if verse_match and chapter is not None:
            verse_num = int(verse_match.group(1))
            verse_text = verse_match.group(2)

            if should_fix_false_restart(verse_num, previous_verse, verse_text):
                fixes.append(
                    Fix(
                        book=path.stem,
                        chapter=chapter,
                        line=idx,
                        previous_verse=previous_verse,
                        original=line,
                    )
                )
                updated.append(verse_text)
                continue

            previous_verse = verse_num
            updated.append(line)
            continue

        updated.append(line)

    if fixes:
        path.write_text("\n".join(updated) + "\n", encoding="utf-8")

    return len(fixes), fixes


def repair_books(book_keys: set[str] | None = None, verbose: bool = True) -> tuple[int, int, list[Fix]]:
    total_fixes = 0
    touched_files = 0
    all_fixes: list[Fix] = []

    for path in sorted(MARKDOWN_DIR.glob("*.md")):
        if book_keys is not None and path.stem not in book_keys:
            continue

        count, fixes = process_file(path)
        if count:
            touched_files += 1
            total_fixes += count
            all_fixes.extend(fixes)
            if verbose:
                print(f"[fixed] {path.name}: {count}")

    if verbose:
        print(f"TOTAL_FIXED={total_fixes}")
        if all_fixes:
            print("SAMPLE_FIXES:")
            for fix in all_fixes[:20]:
                print(
                    f"- {fix.book} ch{fix.chapter} line{fix.line} prev={fix.previous_verse}: "
                    f"{fix.original[:120]}"
                )

    return touched_files, total_fixes, all_fixes


def main() -> int:
    repair_books(verbose=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
