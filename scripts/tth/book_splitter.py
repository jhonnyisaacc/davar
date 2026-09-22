#!/usr/bin/env python3
"""
Book Splitter Module
====================

Splits complete TTH markdown documents into individual per-book markdown files.
Simplified version focused on the TTH2 workflow.

Features:
- Identifies book boundaries in complete documents
- Extracts book content with associated footnotes
- Handles Hebrew and Spanish text properly
- Maintains document structure and formatting

Author: Davar Project
"""

import re
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set
try:
    from .config import BOOKS_INFO
except ImportError:
    from config import BOOKS_INFO

try:
    from .patterns import *
except ImportError:
    from patterns import *


class TTH2BookSplitter:
    """
    Splits complete TTH markdown documents into individual per-book files.
    """

    def __init__(self):
        """Initialize the book splitter."""
        # Build book patterns from BOOKS_INFO to avoid drift
        self.book_patterns = {}
        for book_key, info in BOOKS_INFO.items():
            self.book_patterns[book_key] = info.get('patterns', [])

    @staticmethod
    def count_chapter_markers(text: str) -> int:
        """Count canonical chapter markers like '**1**' on standalone lines."""
        return len(re.findall(r'^\*\*(\d+)\*\*\s*$', text, flags=re.MULTILINE))

    def find_book_boundaries(self, text: str, book_key: str) -> Tuple[int, int]:
        """
        Find the start and end line numbers for a specific book.

        Args:
            text: Complete document text
            book_key: Book identifier (e.g., 'bereshit', 'shemot')

        Returns:
            Tuple of (start_line, end_line)
        """
        lines = text.split('\n')
        book_info = BOOKS_INFO.get(book_key)
        if not book_info:
            raise ValueError(f"Book '{book_key}' not found in BOOKS_INFO")
        patterns = book_info.get('patterns', [])

        if not patterns:
            raise ValueError(
                f"Book '{book_key}' has no patterns configured in BOOKS_INFO")

        def has_hebrew_on_line_or_next(idx: int, candidate_line: str) -> bool:
            """Allow split headers where Hebrew appears on the candidate line or the immediately following line."""
            if re.search(r'[\u0590-\u05FF]', candidate_line):
                return True
            if idx + 1 < len(lines):
                next_line = lines[idx + 1].strip()
                if next_line and re.search(r'[\u0590-\u05FF]', next_line):
                    return True
            return False

        def looks_like_generic_book_header(candidate_line: str) -> bool:
            """
            Detect generic wrapped book headers even when the target book is not
            registered in BOOKS_INFO (e.g. __OBADIÁH (ABDÍAS)__ עבדיה).
            """
            stripped = candidate_line.strip()
            if not stripped:
                return False

            match = re.match(
                r'^__([^_\n]{2,})__\s*([\u0590-\u05FF][\u0590-\u05FF\s]*)$',
                stripped,
            )
            if not match:
                return False

            latin_title = match.group(1)
            return bool(re.search(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]', latin_title))

        # Find book start
        book_start = -1
        for i, line in enumerate(lines):
            line_stripped = line.strip()

            # Skip empty lines
            if not line_stripped:
                continue

            # Check if line is too long (likely not a title)
            if len(line_stripped) > 200:
                continue

            # Check for TOC links (skip them)
            if '](#' in line_stripped:
                continue

            # Check for actual book header first (highest priority)
            if line_stripped.startswith('**') and re.search(r'\*\*.*?\*\*', line_stripped, re.IGNORECASE):
                # Only treat a bold line as a book header if it also matches this book's patterns
                bold_matches_book = False
                for pattern in patterns:
                    if re.search(pattern, line_stripped, re.IGNORECASE):
                        # Additional validation: should contain Hebrew text on this or the next line
                        if has_hebrew_on_line_or_next(i, line_stripped):
                            # Skip TOC entries (lines with tab characters or page numbers)
                            if '\t' in line_stripped or re.search(r'\d{1,3}$', line_stripped.strip()):
                                continue
                            bold_matches_book = True
                            break
                if bold_matches_book:
                    book_start = i
                    break

            # Try each pattern for this book
            for pattern in patterns:
                if re.search(pattern, line_stripped, re.IGNORECASE):
                    # Additional validation: should contain Hebrew text on this or the next line
                    if has_hebrew_on_line_or_next(i, line_stripped):
                        # Skip TOC entries (lines with tab characters or page numbers)
                        if '\t' in line_stripped or re.search(r'\d{1,3}$', line_stripped.strip()):
                            continue
                        # For valid matches
                        elif book_start == -1:
                            book_start = i

            if book_start != -1:
                break

        if book_start == -1:
            raise ValueError(f"Could not find start of book '{book_key}'")

        # Find book end (next book or document end)
        book_end = len(lines)

        # Get all other book keys to find the next one
        other_books = [key for key in self.book_patterns.keys()
                       if key != book_key]

        for i in range(book_start + 1, len(lines)):
            line = lines[i].strip()

            # Skip empty lines and subtitles (but not book headers)
            if not line or (re.match(r'^\*([^*]+)\*$', line) and not line.startswith('**')):
                continue

            # Skip verse lines (avoid treating them as book headers)
            if re.match(r'^\*\*\d+\*\*', line):
                continue

            # Fallback boundary detection for unregistered book headers.
            if looks_like_generic_book_header(line):
                book_end = i
                break

            # Check for book headers first (highest priority)
            # Only check for book headers if the line looks like a title, not a verse
            if line.startswith('**') and len(line.split()) < 10:
                # This is likely a book header, check if it's another book
                for other_book in other_books:
                    other_info = BOOKS_INFO.get(other_book, {})
                    # Try matching against known display names instead of internal keys
                    candidate_names = [
                        other_info.get('tth_name', ''),
                        other_info.get('spanish_name', ''),
                    ]
                    if any(name and name.upper() in line.upper() for name in candidate_names):
                        book_end = i
                        break
                if book_end != len(lines):
                    break
                continue

            # Check if this is the start of another book using patterns
            for other_book in other_books:
                other_patterns = self.book_patterns[other_book]
                for pattern in other_patterns:
                    if re.search(pattern, line, re.IGNORECASE):
                        # Additional validation
                        if has_hebrew_on_line_or_next(i, line) or line.startswith('**'):
                            # Only end if it's an actual book header, not TOC
                            if line.strip().startswith('**') or '__' in line or ('\t' not in line and not re.search(r'\d{1,3}$', line.strip())):
                                book_end = i
                                break
                if book_end != len(lines):
                    break

            if book_end != len(lines):
                break

        return book_start, book_end

    def extract_footnotes_for_book(self, full_text: str, book_text: str) -> List[str]:
        """
        Extract footnote definitions that belong to this book.

        Args:
            full_text: Complete document text
            book_text: Text of the specific book

        Returns:
            List of footnote definition lines
        """
        # Find all footnote references in book text
        footnote_nums = set()
        for match in re.finditer(r'\[\^(\d+)\]', book_text):
            footnote_nums.add(int(match.group(1)))

        if not footnote_nums:
            return []

        # Extract footnote definitions from full text
        footnote_lines = []
        lines = full_text.split('\n')

        for line in lines:
            footnote_match = re.match(r'\[\^(\d+)\]:\s*(.+)', line)
            if footnote_match:
                footnote_num = int(footnote_match.group(1))
                if footnote_num in footnote_nums:
                    footnote_lines.append(line)

        return footnote_lines

    def extract_book_section(self, text: str, book_key: str, verbose: bool = False) -> str:
        """
        Extract a specific book section from the complete document.

        Args:
            text: Complete document text
            book_key: Book identifier
            verbose: If True, print extraction message

        Returns:
            Extracted book text with footnotes
        """
        # Find book boundaries
        start_line, end_line = self.find_book_boundaries(text, book_key)
        lines = text.split('\n')

        # Extract book content
        book_lines = lines[start_line:end_line]
        book_text = '\n'.join(book_lines)

        # Extract associated footnotes
        footnote_lines = self.extract_footnotes_for_book(text, book_text)

        # Combine book content and footnotes
        result_lines = book_lines.copy()

        if footnote_lines:
            result_lines.extend(["", "## Footnotes"])
            result_lines.extend(footnote_lines)

        return '\n'.join(result_lines)

    def split_complete_markdown(self, input_file: str, output_dir: str, books_to_extract: Optional[List[str]] = None, verbose: bool = True) -> Dict[str, str]:
        """
        Split a complete markdown file into individual per-book files.

        Args:
            input_file: Path to complete markdown file
            output_dir: Directory to save individual book files
            books_to_extract: List of specific books to extract (None = all available)
            verbose: If True, print extraction messages. If False, suppress output.

        Returns:
            Dictionary mapping book keys to their output file paths
        """
        # Read the complete markdown
        with open(input_file, 'r', encoding='utf-8') as f:
            text = f.read()

        # Determine which books to extract
        if books_to_extract is None:
            books_to_extract = list(self.book_patterns.keys())

        # Create output directory
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        extracted_books = {}
        extracted_book_hashes: Dict[str, List[str]] = {}

        for book_key in books_to_extract:
            try:
                # Extract book content
                book_text = self.extract_book_section(
                    text, book_key, verbose=False)

                expected_chapters = int(
                    BOOKS_INFO.get(book_key, {}).get('expected_chapters', 0),
                )
                actual_chapters = self.count_chapter_markers(book_text)
                if expected_chapters > 0 and actual_chapters < expected_chapters:
                    raise ValueError(
                        f"Extracted markdown for {book_key} appears truncated: "
                        f"expected {expected_chapters} chapter markers, found {actual_chapters}."
                    )

                # Save to individual file
                output_file = output_path / f"{book_key}.md"
                with open(output_file, 'w', encoding='utf-8') as f:
                    f.write(book_text)

                extracted_books[book_key] = str(output_file)
                content_hash = hashlib.sha256(
                    book_text.encode('utf-8')).hexdigest()
                extracted_book_hashes.setdefault(
                    content_hash, []).append(book_key)
                if verbose:
                    print(f"  ✓ {book_key}")

            except ValueError:
                # Silently skip books not found in this document
                continue

        duplicate_groups = [
            sorted(book_keys)
            for book_keys in extracted_book_hashes.values()
            if len(book_keys) > 1
        ]
        if duplicate_groups:
            collisions = '; '.join(', '.join(group)
                                   for group in duplicate_groups)
            raise ValueError(
                f"Detected identical extracted content across books: {collisions}. "
                "This usually means a header pattern collision in BOOKS_INFO."
            )

        return extracted_books

    def get_available_books(self) -> List[str]:
        """
        Get list of all available book keys.

        Returns:
            List of book identifiers
        """
        return list(BOOKS_INFO.keys())


def split_markdown(input_file: str, output_dir: str, books_to_extract: Optional[List[str]] = None) -> Dict[str, str]:
    """
    Convenience function to split a markdown file into per-book files.

    Args:
        input_file: Path to complete markdown file
        output_dir: Directory to save individual book files
        books_to_extract: List of specific books to extract (None = all)

    Returns:
        Dictionary mapping book keys to their output file paths
    """
    splitter = TTH2BookSplitter()
    return splitter.split_complete_markdown(input_file, output_dir, books_to_extract)
