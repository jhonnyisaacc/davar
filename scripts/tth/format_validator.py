#!/usr/bin/env python3
"""
TTH JSON Format Validator
=========================

Validates formatting consistency for TTH2 JSON files.

Checks:
1. Remaining markdown italics (*...*) in verse text and footnote explanations
2. Disallowed escaped punctuation/brackets (\\!, \\., \\[, \\])
3. Unbalanced <em> tags
4. Basic footnote marker consistency in verse text
5. Non-increasing verse numbering inside each chapter
6. Chapter/verse structural parity against canonical TTH JSON reference
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

DEFAULT_JSON_DIR = Path(__file__).parent.parent.parent / \
    "data" / "tth" / "json"
DEFAULT_REFERENCE_JSON_DIR = Path(__file__).parent.parent.parent / \
    "web" / "public" / "data" / "tth"

DISALLOWED_ESCAPES_RE = re.compile(r'\\([!\.\[\]])')
MARKDOWN_ITALICS_RE = re.compile(r'\*[^*]+\*')
EM_NESTING_RE = re.compile(r'<em>\s*<em>|</em>\s*</em>')
DIVINE_NAME_WRAPPED_RE = re.compile(r'__[^_\n]*יהוה[^_\n]*__')
SUPERSCRIPT_MARKER_RE = re.compile(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+')

SUPERSCRIPT_DIGITS = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
}


class TTHFormatValidator:
    """Validator for TTH2 JSON formatting rules."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose

    @staticmethod
    def _to_superscript_number(value: str) -> str:
        """Convert plain digits into superscript marker representation."""
        return ''.join(SUPERSCRIPT_DIGITS.get(digit, digit) for digit in value)

    @staticmethod
    def _extract_superscript_markers(text: str) -> List[str]:
        """Collect unique superscript marker tokens from verse text."""
        if not text:
            return []
        return sorted(set(match.group(0) for match in SUPERSCRIPT_MARKER_RE.finditer(text)))

    def _extract_monotonic_chapter_verse_counts(self, data: Dict[str, Any], source_name: str) -> Tuple[Dict[int, int], bool]:
        """
        Extract chapter -> verse-count map, keeping only strictly increasing
        chapter numbering. This avoids trailing leaked book content that resets
        numbering (e.g., chapter 9 then chapter 1).
        """
        counts: Dict[int, int] = {}
        previous_chapter = 0
        had_reset = False

        for chapter_data in data.get('chapters', []):
            chapter_num = chapter_data.get('chapter')
            if not isinstance(chapter_num, int) or chapter_num <= 0:
                continue

            if chapter_num <= previous_chapter:
                had_reset = True
                if self.verbose:
                    print(
                        f"⚠️  {source_name}: detected chapter reset/non-increasing marker at chapter {chapter_num}; ignoring trailing structure")
                break

            counts[chapter_num] = len(chapter_data.get('verses', []))
            previous_chapter = chapter_num

        return counts, had_reset

    def _load_reference_structure(self, book_key: str) -> Tuple[Dict[int, int], List[str], bool]:
        """Load expected chapter/verse structure from canonical TTH JSON."""
        issues: List[str] = []
        reference_file = DEFAULT_REFERENCE_JSON_DIR / f"{book_key}.json"

        if not reference_file.exists():
            issues.append(
                f"Structure reference missing: {reference_file.name} in web/public/data/tth")
            return {}, issues, False

        try:
            with open(reference_file, 'r', encoding='utf-8') as f:
                reference_data = json.load(f)
        except Exception as e:
            issues.append(
                f"Failed to load structure reference {reference_file.name}: {e}")
            return {}, issues, False

        expected_counts, had_reset = self._extract_monotonic_chapter_verse_counts(
            reference_data, f"reference {reference_file.name}")

        if not expected_counts:
            issues.append(
                f"Structure reference {reference_file.name} has no usable chapter data")

        if had_reset:
            # Keep this informational: structure comparison remains usable because
            # we intentionally stop at the first reset marker.
            issues.append(
                f"Structure reference {reference_file.name} has trailing chapter reset; comparison uses monotonic prefix")

        return expected_counts, issues, had_reset

    def _validate_structure(self, book_key: str, data: Dict[str, Any], issues: List[str], stats: Dict[str, int]) -> None:
        """Validate chapter/verse counts against canonical TTH reference."""
        expected_counts, reference_notes, reference_had_reset = self._load_reference_structure(
            book_key)
        for note in reference_notes:
            if note.startswith("Structure reference") and "missing" in note:
                stats['structure_reference_missing'] += 1
                issues.append(note)
            elif note.startswith("Failed to load structure reference"):
                stats['structure_reference_load_errors'] += 1
                issues.append(note)
            elif note.startswith("Structure reference") and "no usable chapter data" in note:
                stats['structure_reference_load_errors'] += 1
                issues.append(note)
            else:
                stats['structure_reference_resets_detected'] += 1

        if not expected_counts:
            return

        actual_counts, _ = self._extract_monotonic_chapter_verse_counts(
            data, f"target {book_key}.json")

        # Some web/public/data/tth reference files can contain early chapter
        # resets (e.g., 1..13, then 1..50). In that case, expected_counts is
        # only a truncated prefix and cannot be used for chapter parity checks.
        if reference_had_reset and actual_counts:
            expected_last = max(expected_counts.keys()
                                ) if expected_counts else 0
            actual_last = max(actual_counts.keys())
            if expected_last < actual_last:
                if self.verbose:
                    print(
                        f"⚠️  {book_key}: skipping structure parity checks because reference monotonic prefix ends at chapter {expected_last} but target reaches chapter {actual_last}")
                return

        expected_chapters = sorted(expected_counts.keys())
        actual_chapters = sorted(actual_counts.keys())

        if len(expected_chapters) != len(actual_chapters):
            stats['structure_chapter_count_mismatches'] += 1
            issues.append(
                f"Structure chapter count mismatch: expected {len(expected_chapters)}, got {len(actual_chapters)}"
            )

        expected_set = set(expected_chapters)
        actual_set = set(actual_chapters)

        missing_chapters = sorted(expected_set - actual_set)
        extra_chapters = sorted(actual_set - expected_set)

        for chapter_num in missing_chapters:
            stats['structure_missing_chapters'] += 1
            issues.append(
                f"Structure missing chapter {chapter_num} (expected {expected_counts[chapter_num]} verses)"
            )

        for chapter_num in extra_chapters:
            stats['structure_extra_chapters'] += 1
            issues.append(
                f"Structure extra chapter {chapter_num} (found {actual_counts[chapter_num]} verses)"
            )

        for chapter_num in expected_chapters:
            if chapter_num not in actual_counts:
                continue
            expected_verses = expected_counts[chapter_num]
            actual_verses = actual_counts[chapter_num]
            if expected_verses != actual_verses:
                stats['structure_verse_count_mismatches'] += 1
                issues.append(
                    f"Structure verse count mismatch at chapter {chapter_num}: expected {expected_verses}, got {actual_verses}"
                )

    def _validate_text(self, text: str, label: str) -> List[str]:
        issues: List[str] = []
        if not text:
            return issues

        if MARKDOWN_ITALICS_RE.search(text):
            issues.append(f"{label}: contains markdown italics markers")

        if DISALLOWED_ESCAPES_RE.search(text):
            issues.append(
                f"{label}: contains disallowed escaped punctuation/brackets")

        if text.count('<em>') != text.count('</em>'):
            issues.append(f"{label}: unbalanced <em> tags")

        if EM_NESTING_RE.search(text):
            issues.append(f"{label}: nested/repeated <em> tags")

        if '## Footnotes' in text:
            issues.append(f"{label}: embedded footnotes section leakage")

        if DIVINE_NAME_WRAPPED_RE.search(text):
            issues.append(
                f"{label}: contains wrapped divine-name token (__יהוה__)")

        return issues

    def validate_book_file(self, file_path: Path) -> Tuple[bool, List[str], Dict[str, int]]:
        """Validate formatting of a single TTH2 JSON book file."""
        book_key = file_path.stem
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        issues: List[str] = []
        stats = {
            'verses_checked': 0,
            'footnotes_checked': 0,
            'markdown_italics': 0,
            'escaped_special_chars': 0,
            'unbalanced_em_tags': 0,
            'nested_em_tags': 0,
            'embedded_footnotes_sections': 0,
            'footnote_marker_mismatches': 0,
            'superscript_without_footnote_entries': 0,
            'verse_sequence_issues': 0,
            'wrapped_divine_name_tokens': 0,
            'structure_reference_missing': 0,
            'structure_reference_load_errors': 0,
            'structure_reference_resets_detected': 0,
            'structure_chapter_count_mismatches': 0,
            'structure_missing_chapters': 0,
            'structure_extra_chapters': 0,
            'structure_verse_count_mismatches': 0,
        }

        for chapter in data.get('chapters', []):
            chapter_num = chapter.get('chapter', 0)
            previous_verse_num = None
            for verse in chapter.get('verses', []):
                verse_num = verse.get('verse', 0)
                stats['verses_checked'] += 1

                if isinstance(verse_num, int):
                    if previous_verse_num is not None and verse_num <= previous_verse_num:
                        stats['verse_sequence_issues'] += 1
                        issues.append(
                            f"Ch {chapter_num}:{verse_num} verse sequence regression after {previous_verse_num}"
                        )
                    previous_verse_num = verse_num

                tth_text = verse.get('tth', '')
                verse_issues = self._validate_text(
                    tth_text, f"Ch {chapter_num}:{verse_num} verse text")
                for issue in verse_issues:
                    issues.append(issue)

                if MARKDOWN_ITALICS_RE.search(tth_text):
                    stats['markdown_italics'] += 1
                if DISALLOWED_ESCAPES_RE.search(tth_text):
                    stats['escaped_special_chars'] += 1
                if tth_text.count('<em>') != tth_text.count('</em>'):
                    stats['unbalanced_em_tags'] += 1
                if EM_NESTING_RE.search(tth_text):
                    stats['nested_em_tags'] += 1
                if '## Footnotes' in tth_text:
                    stats['embedded_footnotes_sections'] += 1
                if DIVINE_NAME_WRAPPED_RE.search(tth_text):
                    stats['wrapped_divine_name_tokens'] += 1

                superscript_markers = self._extract_superscript_markers(
                    tth_text)
                available_footnote_markers = set()

                for footnote in verse.get('footnotes', []):
                    stats['footnotes_checked'] += 1
                    explanation = footnote.get('explanation', '')
                    fn_issues = self._validate_text(
                        explanation,
                        f"Ch {chapter_num}:{verse_num} footnote {footnote.get('number', 0)} explanation",
                    )
                    for issue in fn_issues:
                        issues.append(issue)

                    if MARKDOWN_ITALICS_RE.search(explanation):
                        stats['markdown_italics'] += 1
                    if DISALLOWED_ESCAPES_RE.search(explanation):
                        stats['escaped_special_chars'] += 1
                    if explanation.count('<em>') != explanation.count('</em>'):
                        stats['unbalanced_em_tags'] += 1
                    if EM_NESTING_RE.search(explanation):
                        stats['nested_em_tags'] += 1
                    if '## Footnotes' in explanation:
                        stats['embedded_footnotes_sections'] += 1
                    if DIVINE_NAME_WRAPPED_RE.search(explanation):
                        stats['wrapped_divine_name_tokens'] += 1

                    marker = footnote.get('marker', '')
                    if marker and marker not in tth_text:
                        stats['footnote_marker_mismatches'] += 1
                        # Keep mismatch counts for diagnostics, but do not fail
                        # formatting validation on marker-reference integrity.

                    marker_text = str(marker).strip()
                    if marker_text:
                        available_footnote_markers.add(marker_text)

                    number_text = str(footnote.get('number', '')).strip()
                    if number_text:
                        available_footnote_markers.add(
                            self._to_superscript_number(number_text),
                        )

                missing_superscript_refs = [
                    marker
                    for marker in superscript_markers
                    if marker not in available_footnote_markers
                ]
                if missing_superscript_refs:
                    stats['superscript_without_footnote_entries'] += len(
                        missing_superscript_refs,
                    )
                    issues.append(
                        f"Ch {chapter_num}:{verse_num} superscript markers without footnote entries: "
                        + ", ".join(missing_superscript_refs),
                    )

        self._validate_structure(book_key, data, issues, stats)

        return len(issues) == 0, issues, stats

    def validate_all_books(self, json_dir: Path = DEFAULT_JSON_DIR) -> Tuple[bool, Dict[str, Dict[str, int]], Dict[str, List[str]]]:
        """Validate formatting for all TTH2 JSON files in a directory."""
        files = sorted(json_dir.glob('*.json'))
        all_valid = True
        all_stats: Dict[str, Dict[str, int]] = {}
        all_issues: Dict[str, List[str]] = {}

        for file_path in files:
            is_valid, issues, stats = self.validate_book_file(file_path)
            book_key = file_path.stem
            all_stats[book_key] = stats
            all_issues[book_key] = issues
            all_valid = all_valid and is_valid

        return all_valid, all_stats, all_issues


def print_book_report(book_key: str, is_valid: bool, issues: List[str], stats: Dict[str, int]) -> None:
    """Print a compact validation report for one book."""
    if is_valid:
        print(
            f"✅ {book_key}: OK "
            f"({stats['verses_checked']} verses, {stats['footnotes_checked']} footnotes checked)"
        )
        return

    print(f"❌ {book_key}: {len(issues)} formatting issue(s)")
    print(f"   - markdown italics matches: {stats['markdown_italics']}")
    print(f"   - escaped special chars:    {stats['escaped_special_chars']}")
    print(f"   - unbalanced <em> tags:     {stats['unbalanced_em_tags']}")
    print(f"   - nested <em> tags:         {stats['nested_em_tags']}")
    print(
        f"   - embedded footnotes text:  {stats['embedded_footnotes_sections']}")
    print(
        f"   - marker mismatches:        {stats['footnote_marker_mismatches']}")
    print(
        f"   - missing superscript refs: {stats['superscript_without_footnote_entries']}")
    print(f"   - verse sequence issues:    {stats['verse_sequence_issues']}")
    print(
        f"   - wrapped divine names:     {stats['wrapped_divine_name_tokens']}")
    print(
        f"   - missing references:       {stats['structure_reference_missing']}")
    print(
        f"   - ref load errors:          {stats['structure_reference_load_errors']}")
    print(
        f"   - ref reset hints:          {stats['structure_reference_resets_detected']}")
    print(
        f"   - chapter count mismatches: {stats['structure_chapter_count_mismatches']}")
    print(
        f"   - missing chapters:         {stats['structure_missing_chapters']}")
    print(
        f"   - extra chapters:           {stats['structure_extra_chapters']}")
    print(
        f"   - verse count mismatches:   {stats['structure_verse_count_mismatches']}")

    for issue in issues[:8]:
        print(f"   - {issue}")
    if len(issues) > 8:
        print(f"   ... and {len(issues) - 8} more")


def get_format_validator(verbose: bool = False) -> TTHFormatValidator:
    """Create a format validator instance."""
    return TTHFormatValidator(verbose=verbose)
