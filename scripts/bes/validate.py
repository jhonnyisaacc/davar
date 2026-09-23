#!/usr/bin/env python3
"""
Validate BES JSON output against expected book metadata
"""

import json
import logging
import re
from pathlib import Path
from typing import Dict, List, Tuple
from .config import BOOK_METADATA

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent.parent / "data" / "bes" / "json"

# Books that should have chapter titles
BOOKS_WITH_TITLES = {"Psalms"}

# Books that should have headers
BOOKS_WITH_HEADERS = {"SongOfSolomon"}

def validate_bes_output() -> Tuple[bool, Dict[str, List[str]]]:
    """
    Validate all BES JSON files against expected metadata.

    Returns:
        Tuple of (is_valid, errors_dict) where errors_dict maps book names to error messages
    """
    if not OUTPUT_DIR.exists():
        return False, {"general": [f"Output directory does not exist: {OUTPUT_DIR}"]}

    errors = {}
    books_found = 0
    books_valid = 0

    # Check each expected book
    for book_name, metadata in BOOK_METADATA.items():
        book_id = book_name.lower().replace('songofsolomon', 'songofsolomon')
        json_file = OUTPUT_DIR / f"{book_id}.json"

        if not json_file.exists():
            errors[book_name] = [f"JSON file missing: {json_file}"]
            continue

        books_found += 1

        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                book_data = json.load(f)

            book_errors = []

            # Get chapters first
            chapters = book_data.get("chapters", [])

            # Validate book_info
            book_info = book_data.get("book_info", {})
            if not book_info:
                book_errors.append("Missing book_info")
            else:
                # For BES (simplified Bible), don't enforce standard chapter counts
                # Just check that total_chapters matches the actual chapters in data
                actual_chapters_in_data = len(chapters)
                declared_chapters = book_info.get("total_chapters", 0)
                if declared_chapters != actual_chapters_in_data:
                    book_errors.append(f"Declared chapters ({declared_chapters}) doesn't match actual chapters in data ({actual_chapters_in_data})")

            # Validate chapters structure
            if not chapters:
                book_errors.append("No chapters found")
            else:
                # Check chapter numbers are sequential starting from 1
                chapter_nums = sorted([ch.get("chapter") for ch in chapters if ch.get("chapter")])
                expected_nums = list(range(1, len(chapters) + 1))

                if chapter_nums != expected_nums:
                    book_errors.append(f"Chapter numbers not sequential: expected {expected_nums}, got {chapter_nums}")

                # Count total verses and validate titles/headers
                total_verses = 0
                for chapter in chapters:
                    verses = chapter.get("verses", [])
                    total_verses += len(verses)
                    chapter_num = chapter.get("chapter")

                    # Validate verse structure
                    for verse in verses:
                        if not isinstance(verse.get("verse"), int):
                            book_errors.append(f"Invalid verse number in chapter {chapter_num}")
                        if "bes" not in verse:
                            book_errors.append(f"Missing 'bes' field in chapter {chapter_num} verse {verse.get('verse')}")
                        if not verse.get("bes", "").strip():
                            book_errors.append(f"Empty 'bes' text in chapter {chapter_num} verse {verse.get('verse')}")

                        # Check that titles/headers are NOT in verse text
                        verse_text = verse.get("bes", "")
                        if book_name in BOOKS_WITH_TITLES:
                            # Check for common Psalms title patterns in verse text
                            if "Un salmo de" in verse_text and "David" in verse_text:
                                book_errors.append(f"Psalm title found in verse text in chapter {chapter_num} verse {verse.get('verse')}: '{verse_text[:50]}...'")
                        if book_name in BOOKS_WITH_HEADERS:
                            # Check for speaker labels in verse text
                            # Speaker labels that weren't properly extracted are likely to appear
                            # at the beginning or end of the verse text
                            for speaker in ["Ella", "Él", "Coro", "Los Dos"]:
                                # Check if speaker appears at the start or end (most likely leftover label)
                                if verse_text.startswith(speaker + " ") or verse_text.endswith(" " + speaker):
                                    book_errors.append(f"Speaker label '{speaker}' found in verse text in chapter {chapter_num} verse {verse.get('verse')}: '{verse_text}'")
                                # Also check if speaker appears as a standalone word (could be legitimate, but worth flagging)
                                elif re.search(rf'\b{re.escape(speaker)}\b', verse_text):
                                    # Only flag if it's a short verse (heuristic to reduce false positives)
                                    if len(verse_text) < 50:
                                        book_errors.append(f"Speaker label '{speaker}' possibly found in verse text in chapter {chapter_num} verse {verse.get('verse')}: '{verse_text}'")

                    # Validate titles for Psalms
                    if book_name in BOOKS_WITH_TITLES:
                        title = chapter.get("title")
                        if title:
                            logger.debug(f"{book_name} chapter {chapter_num} has title: '{title}'")
                        # Note: Not all Psalms have titles, so we don't require them

                    # Validate headers for Song of Solomon (now in verses)
                    if book_name in BOOKS_WITH_HEADERS:
                        headers_count = sum(1 for v in verses if "header" in v)
                        if headers_count > 0:
                            logger.debug(f"{book_name} chapter {chapter_num} has {headers_count} verses with headers")

                # Log verse count for verification
                logger.info(f"{book_name}: {len(chapters)} chapters, {total_verses} verses")

            if book_errors:
                errors[book_name] = book_errors
            else:
                books_valid += 1

        except json.JSONDecodeError as e:
            errors[book_name] = [f"Invalid JSON: {e}"]
        except Exception as e:
            errors[book_name] = [f"Unexpected error: {e}"]

    # Summary
    total_expected = len(BOOK_METADATA)
    logger.info(f"Validation complete: {books_found}/{total_expected} books found, {books_valid}/{books_found} valid")

    is_valid = len(errors) == 0
    return is_valid, errors

def print_validation_report(is_valid: bool, errors: Dict[str, List[str]]) -> None:
    """Print a human-readable validation report"""
    print("\n" + "="*50)
    print("BES VALIDATION REPORT")
    print("="*50)

    if is_valid:
        print("✅ All books validated successfully!")
    else:
        print("❌ Validation failed. See errors below:")

        for book_name, book_errors in errors.items():
            print(f"\n🔴 {book_name}:")
            for error in book_errors:
                print(f"   - {error}")

    print(f"\nTotal books expected: {len(BOOK_METADATA)}")
    print(f"Books with errors: {len(errors)}")
    print("="*50)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    is_valid, errors = validate_bes_output()
    print_validation_report(is_valid, errors)
    exit(0 if is_valid else 1)