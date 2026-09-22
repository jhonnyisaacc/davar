#!/usr/bin/env python3
"""
Markdown to JSON Converter Module
==================================

Converts individual book markdown files to simplified JSON format for TTH2.
Simplified version focused on the TTH2 workflow.

Features:
- Parses chapters and verses from markdown
- Extracts footnotes with superscript markers
- Detects Hebrew terms automatically
- Generates simplified JSON structure

Author: Davar Project
"""

import json
import re
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
from pathlib import Path

try:
    from .config import BOOKS_INFO, HEBREW_TERMS
    from .patterns import SECTION_HEADER_PATTERN
except ImportError:
    from config import BOOKS_INFO, HEBREW_TERMS
    from patterns import SECTION_HEADER_PATTERN

try:
    from .text_cleaner import get_cleaner
except ImportError:
    # Fallback for testing - try to import from parent directory
    try:
        from text_cleaner import get_cleaner
    except ImportError:
        # Final fallback
        def get_cleaner():
            return None


class TTH2MdToJson:
    """
    Converts individual book markdown files to simplified JSON format.
    """

    def __init__(self, book_key: str):
        """Initialize the converter for a specific book."""
        self.book_key = book_key
        self.book_info = BOOKS_INFO.get(book_key)
        self.hebrew_terms = HEBREW_TERMS
        self.footnote_definitions = {}
        self.book_footnote_number_map: Dict[str, str] = {}
        self.next_book_footnote_number = 1
        self.text_cleaner = get_cleaner()

        if not self.book_info:
            raise ValueError(
                f"Book key '{book_key}' not found in books database")

    def read_markdown(self, file_path: str) -> str:
        """Read markdown file content."""
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

    def extract_footnote_definitions(self, text: str):
        """Extract footnote definitions from document."""
        footnote_section_match = re.search(
            r'##\s*Footnotes\s*\n', text, re.IGNORECASE)
        if footnote_section_match:
            footnote_section = text[footnote_section_match.end():]
        else:
            footnote_section = text

        footnote_pattern = r'\[\^(\d+)\]:\s*(.+?)(?=\n\[|\n\n|$)'
        matches = re.finditer(
            footnote_pattern, footnote_section, re.MULTILINE | re.DOTALL)

        for match in matches:
            footnote_num = match.group(1)
            footnote_def = match.group(2).strip()
            footnote_def = re.sub(r'\*([^*]+)\*', r'\1', footnote_def)
            footnote_def = re.sub(r'\*\*([^*]+)\*\*', r'\1', footnote_def)
            footnote_def = re.sub(r'\s+', ' ', footnote_def).strip()
            self.footnote_definitions[footnote_num] = footnote_def

    def filter_section_headers(self, text: str) -> str:
        """
        Filter out section headers from the markdown text.

        Section headers appear as standalone italic lines like:
        *Anuncio del nacimiento de Iojanán*

        These should be removed before verse parsing to prevent them
        from being included in verse text.
        """
        lines = text.split('\n')
        filtered_lines = []

        # Section header indicators (Spanish keywords that indicate titles)
        title_indicators = [
            'anuncio', 'nacimiento', 'visita', 'profecía', 'crecimiento',
            'proclamación', 'inmersión', 'genealogía', 'tentación',
            'enseña', 'sanación', 'llamado', 'pregunta', 'advertencia',
            'parábola', 'emisión', 'regreso', 'reino', 'juicio',
            'bautismo', 'crucifixión', 'resurrección', 'ascensión',
            'introducción', 'saludo', 'justicia', 'venida', 'oración', 'despedida',
            'firmes', 'deber', 'trabajar', 'ansiedad',
            'siervos', 'vigilantes', 'fiel', 'infiel', 'división',
            'discuten', 'grande', 'humillado', 'humillación',
            'estregado', 'estrellas', 'proclamación', 'monte', 'sal',
            'luz', 'adulterio', 'juramento', 'venganza',
            'otros', 'leproso', 'ciegos', 'doce', 'discípulos', 'manda',
            'habla', 'parábolas', 'multitudes', 'sembrador', 'propósito',
            'cizaña', 'mostaza', 'levadura', 'tesoro', 'piedras',
            'preciosas', 'red', 'mar', 'hombre', 'sabio', 'natzrat',
            'muerte', 'oveja', 'perdida', 'deudores',
            'divorcio', 'obreros', 'viña', 'tercera', 'vez', 'jerijó',
            'boda', 'higuera', 'siervo', 'vírgenes', 'monedas', 'oro'
        ]

        for line in lines:
            stripped = line.strip()

            # Remove standalone bold section headers leaked from source docs.
            # Keep numeric markers (chapter/verse labels) and any digit-led
            # labels to avoid removing legitimate verse numbering content.
            bold_match = re.match(r'^\*\*([^*]+)\*\*$', stripped)
            if bold_match:
                potential_bold_header = bold_match.group(1).strip()
                if potential_bold_header:
                    if re.fullmatch(r'\d+', potential_bold_header):
                        filtered_lines.append(line)
                        continue
                    if re.match(r'^\d+\b', potential_bold_header):
                        filtered_lines.append(line)
                        continue

                    words = potential_bold_header.split()
                    has_letters = any(ch.isalpha()
                                      for ch in potential_bold_header)
                    starts_title_case = potential_bold_header[0].isupper()
                    if has_letters and starts_title_case and len(words) <= 12:
                        continue

            # Check if this is a standalone italic line that could be a section header
            section_match = SECTION_HEADER_PATTERN.match(stripped)
            if section_match:
                potential_header = section_match.group(1).strip()

                # Skip if it's too long (likely legitimate verse content)
                if len(potential_header.split()) > 10:
                    filtered_lines.append(line)
                    continue

                # Skip if it doesn't start with capital letter (likely not a title)
                if not potential_header[0].isupper():
                    filtered_lines.append(line)
                    continue

                # Check for section header indicators
                header_lower = potential_header.lower()
                if any(indicator in header_lower for indicator in title_indicators):
                    # This is a section header - skip it
                    continue

            # Keep the line
            filtered_lines.append(line)

        return '\n'.join(filtered_lines)

    def reset_book_footnote_numbering(self):
        """Reset per-book footnote numbering state before parsing."""
        self.book_footnote_number_map = {}
        self.next_book_footnote_number = 1

    def get_book_footnote_number(self, source_footnote_num: str) -> str:
        """
        Map source footnote IDs to stable per-book sequential numbering.

        The first unique footnote reference in a book becomes 1, the next 2, etc.
        """
        mapped = self.book_footnote_number_map.get(source_footnote_num)
        if mapped is not None:
            return mapped

        mapped = str(self.next_book_footnote_number)
        self.book_footnote_number_map[source_footnote_num] = mapped
        self.next_book_footnote_number += 1
        return mapped

    @staticmethod
    def num_to_superscript(num_str: str) -> str:
        """Convert numeric string to Unicode superscript representation."""
        superscript_map = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
            '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
        }
        return ''.join(superscript_map.get(digit, digit) for digit in num_str)

    @staticmethod
    def _footnote_identity(footnote: Dict[str, str]) -> str:
        """Build a stable key used when merging footnote arrays."""
        number = str(footnote.get('number', '')).strip()
        marker = str(footnote.get('marker', '')).strip()
        word = str(footnote.get('word', '')).strip().lower()
        explanation = str(footnote.get('explanation', '')).strip().lower()

        if number:
            return f"number:{number}"
        if marker:
            return f"marker:{marker}"
        if word:
            return f"word:{word}"
        return f"explanation:{explanation}"

    def merge_verse_footnotes(
        self,
        existing: List[Dict[str, str]],
        extracted: List[Dict[str, str]],
    ) -> List[Dict[str, str]]:
        """
        Merge already-captured verse footnotes with newly extracted ones.

        This prevents losing prior footnotes when continuation lines are
        reparsed after markers were already converted to superscript text.
        """
        if not existing:
            return extracted
        if not extracted:
            return existing

        merged_by_key: Dict[str, Dict[str, str]] = {}
        merge_order: List[str] = []

        def add_footnote(footnote: Dict[str, str]) -> None:
            normalized = {
                'marker': str(footnote.get('marker', '')),
                'number': str(footnote.get('number', '')),
                'word': str(footnote.get('word', '')),
                'explanation': str(footnote.get('explanation', '')),
            }
            key = self._footnote_identity(normalized)

            if key in merged_by_key:
                current = merged_by_key[key]
                if not current['marker'] and normalized['marker']:
                    current['marker'] = normalized['marker']
                if not current['number'] and normalized['number']:
                    current['number'] = normalized['number']
                if not current['word'] and normalized['word']:
                    current['word'] = normalized['word']
                if not current['explanation'] and normalized['explanation']:
                    current['explanation'] = normalized['explanation']
                return

            merged_by_key[key] = normalized
            merge_order.append(key)

        for footnote in existing:
            add_footnote(footnote)
        for footnote in extracted:
            add_footnote(footnote)

        merged = [merged_by_key[key] for key in merge_order]
        return sorted(
            merged,
            key=lambda footnote: (
                0,
                int(footnote['number']),
            )
            if footnote.get('number', '').strip().isdigit()
            else (
                1,
                footnote.get('marker', ''),
                footnote.get('word', ''),
            ),
        )

    def extract_footnotes(self, text: str) -> Tuple[str, List[Dict[str, str]]]:
        """Extract footnotes from text and convert to superscript."""
        footnotes = []
        seen_source_numbers = set()

        footnote_pattern = r'\[\^(\d+)\]'
        matches = list(re.finditer(footnote_pattern, text))

        def extract_associated_word(text_before_marker: str) -> str:
            """Extract word associated with footnote."""
            text_before = text_before_marker.rstrip()

            compound_terms = [
                (r"Rúaj\s+Ha['']Kódesh", "Rúaj Ha'Kódesh"),
                (r"Ben\s+Ha['']Adam", "Ben Ha'Adam"),
                (r"Bet\s+Léjem", "Bet Léjem"),
                (r"Bet\s+Aniah", "Bet Aniah"),
            ]

            # Check for compound terms
            search_text = text_before[-50:] if len(
                text_before) > 50 else text_before
            for term_pattern, term_name in compound_terms:
                pattern = term_pattern + r'\s*$'
                match = re.search(pattern, search_text, re.IGNORECASE)
                if match:
                    return term_name

            simple_word_pattern = r'([\w\'-]+)\s*$'
            match = re.search(simple_word_pattern, text_before)

            if match:
                word = match.group(1).strip()
                word = re.sub(r'[.,;:!?]+$', '', word)
                return word if word else ''

            return ''

        # Create mapping of footnote positions and associated words
        footnote_info = {}
        for match in matches:
            source_footnote_num = match.group(1)
            book_footnote_num = self.get_book_footnote_number(
                source_footnote_num)
            marker = self.num_to_superscript(book_footnote_num)
            definition = self.footnote_definitions.get(
                source_footnote_num, f'Nota al pie {source_footnote_num}')

            text_before = text[:match.start()]
            associated_word = extract_associated_word(text_before)

            footnote_info[source_footnote_num] = {
                'marker': marker,
                'number': book_footnote_num,
                'definition': definition,
                'word': associated_word,
                'source_number': source_footnote_num,
            }

        # Replace all footnote markers with superscripts
        def replace_footnote(match):
            source_footnote_num = match.group(1)
            info = footnote_info[source_footnote_num]
            if source_footnote_num not in seen_source_numbers:
                seen_source_numbers.add(source_footnote_num)
                footnotes.append({
                    'marker': info['marker'],
                    'number': info['number'],
                    'word': info['word'],
                    'explanation': info['definition']
                })
            return info['marker']

        modified_text = re.sub(footnote_pattern, replace_footnote, text)

        footnotes.sort(key=lambda x: int(x['number']))
        return modified_text.strip(), footnotes

    def clean_text_preserve_comments(self, text: str) -> str:
        """
        Clean text while preserving comments, formatting, and italic emphasis.
        Simplified version to avoid regex hangs.
        """
        modified_text = text

        # Remove verse markers that may remain
        modified_text = re.sub(r'\*\*(\d+)\*\*', r'\1', modified_text)

        # Apply advanced text cleaning (this is the core functionality)
        modified_text = self.text_cleaner.clean_verse_text(modified_text)

        # Clean whitespace (simplified to avoid hangs)
        modified_text = ' '.join(modified_text.split()).strip()

        return modified_text

    def starts_inline_footnote_blob(self, lines: List[str], index: int, line: str) -> bool:
        """
        Detect leaked inline footnote apparatus blocks inside chapter content.

        Corrupted markdown sometimes injects blocks like:
          1.
          [^1]: ...

        between verse lines. These must be skipped during verse parsing.
        """
        stripped = line.strip()

        # Numbered marker line followed by a footnote definition line.
        if re.match(r'^\d+\.\s*$', stripped):
            if index + 1 < len(lines):
                next_line = lines[index + 1].strip()
                if re.match(r'^\[\^\d+\]:', next_line):
                    return True

        # A standalone footnote definition inside chapter flow is also a leak.
        if re.match(r'^\[\^\d+\]:', stripped):
            return True

        return False

    def is_plain_section_header_line(self, lines: List[str], index: int, line: str) -> bool:
        """
        Detect unformatted standalone section headers between verse blocks.

        Some source books contain section titles as plain text lines (without
        italic markers), e.g. "Matrimonio simbólico de Hoshea". If left as-is,
        these lines are appended to the previous verse body. We convert only
        highly structured, isolated candidates and leave normal prose untouched.
        """
        stripped = line.strip()
        if not stripped:
            return False

        # Ignore known non-header markers.
        if stripped.startswith('#'):
            return False
        if stripped.startswith('*'):
            return False
        if re.match(r'^\*\*(\d+)\*\*(?:\s+.+)?$', stripped):
            return False
        if re.match(r'^\[\^\d+\]:', stripped):
            return False

        # Titles in this corpus appear isolated by blank lines.
        prev_raw_blank = index > 0 and not lines[index - 1].strip()
        next_raw_blank = index + \
            1 < len(lines) and not lines[index + 1].strip()
        if not (prev_raw_blank and next_raw_blank):
            return False

        # Context guard: must be between verse/chapter markers.
        prev_nonempty = ''
        for j in range(index - 1, -1, -1):
            candidate = lines[j].strip()
            if candidate:
                prev_nonempty = candidate
                break

        next_nonempty = ''
        for j in range(index + 1, len(lines)):
            candidate = lines[j].strip()
            if candidate:
                next_nonempty = candidate
                break

        if not re.match(r'^\*\*\d+\*\*', prev_nonempty):
            return False
        if not re.match(r'^\*\*\d+\*\*(?:\s+.+)?$', next_nonempty):
            return False

        # Keep heuristic strict to avoid dropping legitimate wrapped verse prose.
        if re.search(r'[,;:!?]', stripped):
            return False
        if re.search(r'\[\^\d+\]', stripped):
            return False

        words = re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+", stripped)
        if len(words) < 2 or len(words) > 10:
            return False

        first_word = words[0]
        if not first_word[0].isupper():
            return False

        # Narrative continuations often start with conjunctions/pronouns.
        if first_word.lower() in {'y', 'pero', 'porque', 'pues', 'yo', 'él', 'ella', 'ellos', 'ellas', 'ustedes', 'nosotros'}:
            return False

        return True

    def is_book_header_boundary_line(self, line: str) -> bool:
        """
        Detect a new-book header marker leaked into a per-book markdown file.

        Examples seen in source artifacts:
          __OBADIÁH (ABDÍAS)__ עבדיה
          __IOJANÁN (JUAN)__יוחנן

        We require both Latin title text and trailing Hebrew text to avoid
        matching inline markers like __יהוה__.
        """
        stripped = line.strip()
        if not stripped:
            return False

        marker_match = re.match(
            r'^__([^_\n]{2,})__\s*([\u0590-\u05FF][\u0590-\u05FF\s]*)$', stripped)
        if not marker_match:
            return False

        latin_title = marker_match.group(1).strip()
        hebrew_title = marker_match.group(2).strip()

        if not re.search(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]', latin_title):
            return False

        own_latin_candidates = [
            (self.book_info.get('tth_name') or '').strip(),
            (self.book_info.get('spanish_name') or '').strip(),
            (self.book_info.get('english_name') or '').strip(),
        ]
        own_hebrew = (self.book_info.get('hebrew_name') or '').strip()

        latin_upper = latin_title.upper()
        for candidate in own_latin_candidates:
            if candidate and candidate.upper() in latin_upper:
                return False

        if own_hebrew and own_hebrew in hebrew_title:
            return False

        return True

    def normalize_malformed_verse_markers(self, text: str) -> str:
        """
        Normalize corrupted inline verse markers emitted by DOCX->MD conversion.

        Example:
                    **3\\* \\***  ->  **3**
        """
        if not text:
            return text

        # Handle patterns where the closing marker became escaped stars.
        text = re.sub(
            r'\*\*(\d+)(?:\\\*\s+\\\*|\*\s+\*)\*\*',
            r'**\1**',
            text,
        )
        return text

    def split_inline_verse_segments(self, initial_verse_num: int, verse_text: str) -> List[Tuple[int, str]]:
        """
        Split a verse text when additional verse markers are embedded inline.

        Returns a list of (verse_number, verse_text_segment) tuples.
        """
        segments: List[Tuple[int, str]] = []
        current_num = initial_verse_num
        remaining = self.normalize_malformed_verse_markers(verse_text)

        while True:
            marker_match = re.search(r'\*\*(\d+)\*\*\s*', remaining)
            if not marker_match:
                final_text = remaining.strip()
                if final_text:
                    segments.append((current_num, final_text))
                break

            head_text = remaining[:marker_match.start()].strip()
            if head_text:
                segments.append((current_num, head_text))

            current_num = int(marker_match.group(1))
            remaining = remaining[marker_match.end():]

        expanded_segments: List[Tuple[int, str]] = []
        for seg_num, seg_text in segments:
            expanded_segments.extend(
                self.split_plain_inline_verse_segments(seg_num, seg_text)
            )

        return expanded_segments

    def split_plain_inline_verse_segments(self, initial_verse_num: int, verse_text: str) -> List[Tuple[int, str]]:
        """
        Split inline plain-number verse transitions that lost markdown markers.

        Example handled conservatively:
            "... anuncio. 11 Y entró Yeshúa ..." ->
            [(10, "... anuncio."), (11, "Y entró Yeshúa ...")]

        To avoid false positives, only split on the immediate next verse number
        and only when followed by an uppercase Latin or Hebrew letter.
        """
        if not verse_text:
            return []

        segments: List[Tuple[int, str]] = []
        current_num = initial_verse_num
        remaining = verse_text.strip()

        while True:
            match = re.search(
                r'\s+(\d{1,3})\s+([A-ZÁÉÍÓÚÜÑ\u0590-\u05FF])',
                remaining,
            )
            if not match:
                if remaining:
                    segments.append((current_num, remaining.strip()))
                break

            next_num = int(match.group(1))
            if next_num != current_num + 1:
                if remaining:
                    segments.append((current_num, remaining.strip()))
                break

            head = remaining[:match.start()].strip()
            if head:
                segments.append((current_num, head))

            current_num = next_num
            remaining = (match.group(2) + remaining[match.end():]).strip()

        return segments

    def split_known_merged_verses(self, chapters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Normalize source places where verse markers were lost entirely.

        These are deterministic TTH source conversion defects. They are handled
        here instead of at runtime so generated TTH JSON has one record per
        verse and app fallback logic does not substitute BES unnecessarily.
        """
        if self.book_key != 'devarim':
            return chapters

        replacements: Dict[Tuple[int, int], List[Dict[str, Any]]] = {
            (1, 9): [
                {
                    'verse': 9,
                    'tth': 'Y hablé a ustedes en ese tiempo, diciendo: “No puedo yo solo cargar *los* a ustedes.',
                    'footnotes': [],
                    'hebrew_terms': [],
                },
                {
                    'verse': 10,
                    'tth': 'יהוה su Elohim los ha multiplicado, y he aquí ustedes, hoy *son* como las estrellas del cielo, por multitud.',
                    'footnotes': [],
                    'hebrew_terms': [],
                },
                {
                    'verse': 11,
                    'tth': 'יהוה, Elohim de sus padres, *los* aumente a ustedes, conforme son, mil veces, y los bendiga como *les* ha hablado a ustedes.',
                    'footnotes': [],
                    'hebrew_terms': [],
                },
            ],
            (5, 1): [
                {
                    'verse': 1,
                    'tth': 'Y llamó Moshéh a todo Israel, y dijo a ellos: Escucha Israel los decretos⁵⁴ y los procesos legales⁵⁵ que yo hablo en sus oídos hoy, para que los aprendan y guarden para hacerlos.',
                    'footnotes': [
                        {
                            'marker': '⁵⁴',
                            'number': '54',
                            'word': 'decretos',
                            'explanation': 'Heb.: Jukim.',
                        },
                        {
                            'marker': '⁵⁵',
                            'number': '55',
                            'word': 'legales',
                            'explanation': 'Heb.: Mishpatim.',
                        },
                    ],
                    'hebrew_terms': [],
                },
                {
                    'verse': 2,
                    'tth': 'יהוה Elohim nuestro ha hecho⁵⁶ con nosotros un pacto en Joreb.',
                    'footnotes': [
                        {
                            'marker': '⁵⁶',
                            'number': '56',
                            'word': 'hecho',
                            'explanation': 'Lit.: cortado. Así también en vers. 3.',
                        },
                    ],
                    'hebrew_terms': [],
                },
            ],
        }

        normalized_chapters: List[Dict[str, Any]] = []
        for chapter_data in chapters:
            chapter_num = chapter_data.get('chapter')
            normalized_verses: List[Dict[str, Any]] = []

            for verse_data in chapter_data.get('verses', []):
                verse_num = verse_data.get('verse')
                replacement = replacements.get((chapter_num, verse_num))
                if replacement:
                    normalized_verses.extend(replacement)
                else:
                    normalized_verses.append(verse_data)

            normalized_chapters.append({
                **chapter_data,
                'verses': normalized_verses,
            })

        return normalized_chapters

    def should_merge_regressed_marker_as_continuation(
        self,
        candidate_num: int,
        previous_num: Optional[int],
        candidate_text: str,
    ) -> bool:
        """
        Detect a known wrapped-line corruption pattern across source books.

        Some lines are incorrectly emitted as a fresh "**1** ..." marker while
        actually continuing the previous verse. Keep this extremely narrow and
        retain strict failures for any ambiguous/non-deterministic regressions.
        """
        if previous_num is None or previous_num < 1:
            return False

        if candidate_num != 1:
            return False

        trimmed = candidate_text.strip()
        if not trimmed:
            return False

        # Continuation fragments usually start with lowercase narrative text.
        return bool(re.match(r'^[a-záéíóúñü]', trimmed, re.IGNORECASE))

    def parse_chapters_and_verses(self, book_text: str, verbose: bool = False) -> List[Dict[str, Any]]:
        """Parse chapters and verses from the book text."""
        lines = book_text.split('\n')
        chapters = []

        current_chapter = None
        current_verses = []
        current_last_verse_num: Optional[int] = None
        total_chapters_expected = self.book_info.get('chapters', 0)
        skipping_inline_footnote_blob = False

        i = 0
        while i < len(lines):
            line = lines[i].strip()
            line = self.normalize_malformed_verse_markers(line)

            # Skip empty lines
            if not line:
                i += 1
                continue

            # Stop parsing when we reach the footnotes section
            if line.startswith('## Footnotes') or line.startswith('# Footnotes'):
                break

            # Stop parsing if a new-book header leaked into this markdown file.
            if self.is_book_header_boundary_line(line):
                break

            # Skip malformed inline footnote blocks until the next verse/chapter marker.
            if skipping_inline_footnote_blob:
                if re.match(r'^\*\*(\d+)\*\*\s*$', line) or re.match(r'^\*\*(\d+)\*\*\s+.+$', line):
                    skipping_inline_footnote_blob = False
                else:
                    i += 1
                    continue

            # Check for chapter markers
            chapter_match = re.match(r'^\*\*(\d+)\*\*\s*$', line)
            if chapter_match:
                next_chapter = int(chapter_match.group(1))

                # Guard against false chapter restarts leaked by conversion
                # artifacts (e.g. a stray "**1**" inside chapter 19).
                if current_chapter is not None and next_chapter <= current_chapter:
                    i += 1
                    continue

                # Save previous chapter if exists
                if current_chapter is not None and current_verses:
                    chapters.append({
                        'chapter': current_chapter,
                        'verses': current_verses
                    })

                current_chapter = next_chapter
                current_verses = []
                current_last_verse_num = None
                i += 1
                continue

            # Process verses if we're in a chapter
            if current_chapter is not None:
                # Detect and skip leaked inline apparatus before it gets appended
                # to the previous verse body.
                if self.starts_inline_footnote_blob(lines, i, line):
                    skipping_inline_footnote_blob = True
                    i += 1
                    continue

                # Look for verse markers
                verse_match = re.match(r'^\*\*(\d+)\*\*\s*(.+)$', line)
                if verse_match:
                    verse_num = int(verse_match.group(1))
                    verse_text = verse_match.group(2).strip()

                    for split_verse_num, split_verse_text in self.split_inline_verse_segments(verse_num, verse_text):
                        if (
                            current_verses
                            and self.should_merge_regressed_marker_as_continuation(
                                split_verse_num,
                                current_last_verse_num,
                                split_verse_text,
                            )
                        ):
                            merged = f"{current_verses[-1]['tth']} {split_verse_text}".strip()
                            merged = self.clean_text_preserve_comments(merged)
                            merged, merged_footnotes = self.extract_footnotes(
                                merged)
                            current_verses[-1]['tth'] = merged
                            current_verses[-1]['footnotes'] = self.merge_verse_footnotes(
                                current_verses[-1].get('footnotes', []),
                                merged_footnotes,
                            )
                            current_verses[-1]['hebrew_terms'] = []
                            continue

                        cleaned_text = self.clean_text_preserve_comments(
                            split_verse_text)
                        cleaned_text, footnotes = self.extract_footnotes(
                            cleaned_text)

                        if current_last_verse_num is not None and split_verse_num <= current_last_verse_num:
                            raise ValueError(
                                f"Verse sequence regression in {self.book_key} chapter {current_chapter}: "
                                f"got verse {split_verse_num} after {current_last_verse_num}. "
                                f"Offending line: {line}"
                            )

                        verse_entry = {
                            'verse': split_verse_num,
                            'tth': cleaned_text,
                            'footnotes': footnotes,
                            'hebrew_terms': []
                        }

                        current_verses.append(verse_entry)
                        current_last_verse_num = split_verse_num
                    i += 1
                    continue

                # Handle malformed lines where verse number and initial content
                # were wrapped together in one bold span (e.g., "**32 y** ...").
                malformed_verse_match = re.match(
                    r'^\*\*(\d+)\s+(.+?)\*\*\s*(.*)$', line)
                if malformed_verse_match:
                    verse_num = int(malformed_verse_match.group(1))
                    verse_head = malformed_verse_match.group(2).strip()
                    verse_tail = malformed_verse_match.group(3).strip()
                    verse_text = f"{verse_head} {verse_tail}".strip()

                    if (
                        current_verses
                        and self.should_merge_regressed_marker_as_continuation(
                            verse_num,
                            current_last_verse_num,
                            verse_text,
                        )
                    ):
                        merged = f"{current_verses[-1]['tth']} {verse_text}".strip()
                        merged = self.clean_text_preserve_comments(merged)
                        merged, merged_footnotes = self.extract_footnotes(
                            merged)
                        current_verses[-1]['tth'] = merged
                        current_verses[-1]['footnotes'] = self.merge_verse_footnotes(
                            current_verses[-1].get('footnotes', []),
                            merged_footnotes,
                        )
                        current_verses[-1]['hebrew_terms'] = []
                        i += 1
                        continue

                    verse_text = self.clean_text_preserve_comments(verse_text)
                    verse_text, footnotes = self.extract_footnotes(verse_text)

                    if current_last_verse_num is not None and verse_num <= current_last_verse_num:
                        raise ValueError(
                            f"Verse sequence regression in {self.book_key} chapter {current_chapter}: "
                            f"got verse {verse_num} after {current_last_verse_num}. "
                            f"Offending line: {line}"
                        )

                    verse_entry = {
                        'verse': verse_num,
                        'tth': verse_text,
                        'footnotes': footnotes,
                        'hebrew_terms': []
                    }

                    current_verses.append(verse_entry)
                    current_last_verse_num = verse_num
                    i += 1
                    continue

                # Continue accumulating verse text (multi-line verses)
                elif current_verses and line:
                    # Never append what looks like a new verse/chapter marker.
                    if re.match(r'^\*\*\d+\*\*', line):
                        i += 1
                        continue

                    # Plain standalone section headers (no markdown formatting)
                    # should become subtitle material, not verse body text.
                    if self.is_plain_section_header_line(lines, i, line):
                        line = f"*{line}*"

                    # Add to the last verse, then re-split in case this
                    # continuation line embeds a new inline verse marker
                    # (e.g. "... **11** Y ..." after verse 10 text).
                    last_verse = current_verses[-1]
                    combined_text = f"{last_verse['tth']} {line.strip()}".strip(
                    )
                    split_segments = self.split_inline_verse_segments(
                        last_verse['verse'], combined_text)

                    if len(split_segments) <= 1:
                        # Regular multiline continuation, keep existing behavior.
                        existing_footnotes = list(
                            last_verse.get('footnotes', []))
                        last_verse['tth'] = self.clean_text_preserve_comments(
                            combined_text)
                        last_verse['tth'], extracted_footnotes = self.extract_footnotes(
                            last_verse['tth'])
                        last_verse['footnotes'] = self.merge_verse_footnotes(
                            existing_footnotes,
                            extracted_footnotes,
                        )
                        last_verse['hebrew_terms'] = []
                    else:
                        # Replace the current last verse with the re-split output.
                        previous_last_verse = current_verses.pop()
                        for split_verse_num, split_verse_text in split_segments:
                            cleaned_text = self.clean_text_preserve_comments(
                                split_verse_text)
                            cleaned_text, extracted_footnotes = self.extract_footnotes(
                                cleaned_text)

                            footnotes = extracted_footnotes
                            if split_verse_num == previous_last_verse.get('verse'):
                                footnotes = self.merge_verse_footnotes(
                                    previous_last_verse.get('footnotes', []),
                                    extracted_footnotes,
                                )

                            current_verses.append({
                                'verse': split_verse_num,
                                'tth': cleaned_text,
                                'footnotes': footnotes,
                                'hebrew_terms': []
                            })

            i += 1

        # Save last chapter
        if current_chapter is not None and current_verses:
            chapters.append({
                'chapter': current_chapter,
                'verses': current_verses
            })

        return chapters

    def create_json_structure(self, chapters: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create the final JSON structure."""
        # Calculate statistics
        total_chapters = len(chapters)
        total_verses = sum(len(chapter['verses']) for chapter in chapters)

        # Create book info with proper structure
        book_info = {
            'book_id': self.book_key,
            'tth_name': self.book_info['tth_name'],
            'hebrew_name': self.book_info['hebrew_name'],
            'english_name': self.book_info['english_name'],
            'spanish_name': self.book_info['spanish_name'],
            'section': self.book_info['section'],
            'total_chapters': total_chapters,
            'total_verses': total_verses
        }

        # Create chapters structure
        chapters_structure = []
        for chapter_data in chapters:
            chapter_entry = {
                'chapter': chapter_data['chapter'],
                'verses': chapter_data['verses']
            }
            chapters_structure.append(chapter_entry)

        return {
            'book_info': book_info,
            'chapters': chapters_structure
        }

    def convert_markdown_to_json(self, input_file: str, output_file: Optional[str] = None, verbose: bool = False) -> str:
        """
        Convert a book markdown file to JSON.

        Args:
            input_file: Path to markdown file
            output_file: Path to output JSON file (auto-generated if None)
            verbose: If True, print detailed progress messages

        Returns:
            Path to the output JSON file
        """
        # Generate output filename if not provided
        if output_file is None:
            input_path = Path(input_file)
            output_file = str(input_path.with_suffix('.json'))

        # Read and process markdown
        markdown_text = self.read_markdown(input_file)

        # Filter out section headers before processing
        if verbose:
            print(f"    Filtering section headers...", end=' ', flush=True)
        markdown_text = self.filter_section_headers(markdown_text)
        if verbose:
            print(f"✓")

        # Extract footnote definitions
        if verbose:
            print(f"    Extracting footnotes...", end=' ', flush=True)
        self.extract_footnote_definitions(markdown_text)
        if verbose:
            print(f"✓ ({len(self.footnote_definitions)} found)")

        # Parse chapters and verses (show progress for large books)
        if verbose:
            print(f"    Parsing chapters and verses...", end=' ', flush=True)
        self.reset_book_footnote_numbering()
        chapters = self.parse_chapters_and_verses(
            markdown_text, verbose=verbose)
        chapters = self.split_known_merged_verses(chapters)
        if verbose:
            print(f"✓")

        # Create JSON structure
        json_data = self.create_json_structure(chapters)

        # Write JSON file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)

        if verbose:
            print(f"✓ Saved JSON to {output_file}")
            print(f"  Chapters: {json_data['book_info']['total_chapters']}")
            print(f"  Verses: {json_data['book_info']['total_verses']}")

        return output_file


def convert_book_markdown_to_json(book_key: str, input_file: str, output_file: Optional[str] = None, verbose: bool = False) -> str:
    """
    Convenience function to convert a book markdown file to JSON.

    Args:
        book_key: Book identifier
        input_file: Path to markdown file
        output_file: Path to output JSON file (optional)
        verbose: If True, print detailed progress messages

    Returns:
        Path to the output JSON file
    """
    converter = TTH2MdToJson(book_key)
    return converter.convert_markdown_to_json(input_file, output_file, verbose)
