#!/usr/bin/env python3
"""
TTH2 Shared Patterns Module
===========================

Centralized regex patterns and character classes for TTH2 processing.
Eliminates duplication across multiple modules.

Author: Davar Project
"""

import re

# Character classes (repeated throughout codebase)
LATIN_CHARS = r'A-Za-zÁÉÍÓÚáéíóúñÑ'
HEBREW_CHARS = r'\u0590-\u05FF'
WORD_CHARS = f'{LATIN_CHARS}{HEBREW_CHARS}'
WORD_CHARS_DASH = f'{WORD_CHARS}-\\\''

# Pre-compiled patterns for performance
VERSE_MARKER = re.compile(r'\*\*(\d+)\*\*')
CHAPTER_MARKER = re.compile(r'^\*\*(\d+)\*\*\s*$')
ITALICS_PATTERN = re.compile(r'\*([^*]+?)\*')
FOOTNOTE_REF = re.compile(r'\[\^(\d+)\]')
SOFT_HYPHEN = re.compile(r'([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])\\\-\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])')

# Punctuation patterns
PUNCTUATION_NEED_SPACE = [':', ';', ',', '?', '!']
PUNCTUATION_PATTERN = re.compile(
    rf'([{re.escape("".join(PUNCTUATION_NEED_SPACE))}])([^\s\n\r])',
    re.UNICODE
)

# Hebrew term patterns (for future use)
HEBREW_WORD = re.compile(rf'[{HEBREW_CHARS}]+')

# Section header detection patterns
SECTION_HEADER_PATTERN = re.compile(r'^\*\s*([^<\n*]+?)\s*\*\s*$', re.MULTILINE)

# Underscore artifacts from DOCX conversion
UNDERSCORE_ARTIFACTS = [
    (r'__\*\s*\*__', ' '),
    (r'\*__\*\s*\*__', '*'),
    (r'__\*\s*\*', ' '),
    (r'\*\s*\*__', ' '),
]

# Escaped parentheses pattern
ESCAPED_PARENS = re.compile(r'\\[()]')

# Em spacing patterns
EM_BEFORE_PATTERN = re.compile(rf'([{WORD_CHARS}])(<em>)')
EM_AFTER_PATTERN = re.compile(rf'(</em>)([{WORD_CHARS}])')

# Broken italics patterns (from json_postprocess.py)
BROKEN_ITALICS_PATTERNS = [
    # *word * → *word*
    (r'\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\']*)\s+\*(?=[^*]|$)', r'*\1* '),
    # * word* → *word*
    (r'(\s)\*\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\']*)\*', r'\1*\2*'),
    # At start of string
    (r'^\*\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\']*)\*', r'*\1*'),
    # word* *next → word next (split markers)
    (r'([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF]+)\*\s+\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])', r'\1 *\2'),
    # punctuation* *word → punctuation word
    (r'([,\.;:])\*\s+\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])', r'\1 *\2'),
]

# Single word italics pattern
SINGLE_WORD_ITALICS = re.compile(
    rf'\*([{WORD_CHARS_DASH}]+)\*'
)

# Orphan asterisks patterns
ORPHAN_ASTERISKS = [
    (r'([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF,\.;:]+)\*\s+\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])', r'\1 \2'),
    (r'(?<![A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\'\s,\.;:]*?)(?=\s|$|[,\.;:\"\'])', ''),
]

# Footnote superscript conversion
SUPERSCRIPT_MAP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
    '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
}

def num_to_superscript(num_str: str) -> str:
    """Convert a number string to superscript unicode."""
    return ''.join(SUPERSCRIPT_MAP.get(digit, digit) for digit in num_str)


# Regexes used by the Markdown-to-JSON converter and the JSON postprocessor.
# Call sites keep the same flags and replacement strings.

FOOTNOTE_SECTION = r'##\s*Footnotes\s*\n'
FOOTNOTE_DEFINITION = r'\[\^(\d+)\]:\s*(.+?)(?=\n\[|\n\n|$)'
FOOTNOTE_MARKER = r'\[\^(\d+)\]'
FOOTNOTE_MARKER_LOOSE = r'\[\^\d+\]'
FOOTNOTE_DEF_LINE = r'^\[\^\d+\]:'
ITALIC_SPAN = r'\*([^*]+)\*'
ITALIC_SPAN_LAZY = r'\*([^*]+?)\*'
BOLD_SPAN = r'\*\*([^*]+)\*\*'
BOLD_SPAN_LAZY = r'\*\*([^*]+?)\*\*'
BOLD_NUMBER = r'\*\*(\d+)\*\*'
WHITESPACE = r'\s+'
MULTI_SPACE = r'\s{2,}'
DOUBLE_SPACE = r'  +'
TRAILING_SPACE = r'\s*$'
SPACE_BEFORE_PUNCT = r'\s+([,.;:!?])'
BOLD_LINE = r'^\*\*([^*]+)\*\*$'
DIGITS = r'\d+'
LEADING_DIGITS = r'^\d+\b'
TRAILING_WORD = r'([\w\'-]+)\s*$'
TRAILING_PUNCT = r'[.,;:!?]+$'
NUMBERED_MARKER_LINE = r'^\d+\.\s*$'
BOLD_NUMBER_LINE = r'^\*\*(\d+)\*\*(?:\s+.+)?$'
BOLD_NUMBER_PREFIX = r'^\*\*\d+\*\*'
BOLD_NUMBER_PREFIX_LINE = r'^\*\*\d+\*\*(?:\s+.+)?$'
INLINE_PUNCT = r'[,;:!?]'
LATIN_WORD = r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+"
LATIN_LETTER = r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]'
BOOK_HEADER_BOUNDARY = r'^__([^_\n]{2,})__\s*([\u0590-\u05FF][\u0590-\u05FF\s]*)$'
MALFORMED_VERSE_MARKER = r'\*\*(\d+)(?:\\\*\s+\\\*|\*\s+\*)\*\*'
INLINE_VERSE_MARKER = r'\*\*(\d+)\*\*\s*'
PLAIN_INLINE_VERSE = r'\s+(\d{1,3})\s+([A-ZÁÉÍÓÚÜÑ\u0590-\u05FF])'
LOWERCASE_CONTINUATION = r'^[a-záéíóúñü]'
CHAPTER_MARKER_LINE = r'^\*\*(\d+)\*\*\s*$'
VERSE_MARKER_LINE = r'^\*\*(\d+)\*\*\s+.+$'
VERSE_MARKER_CAPTURE = r'^\*\*(\d+)\*\*\s*(.+)$'
MALFORMED_VERSE_LINE = r'^\*\*(\d+)\s+(.+?)\*\*\s*(.*)$'
HEBREW_DIACRITICS = r'[\u0591-\u05BD\u05BF-\u05C7]'
EM_TAG = r'</?em>'
LEADING_EDGE_PUNCT = r"^[,.;:!?\"'“”‘’()\[\]{}]+"
TRAILING_EDGE_PUNCT = r"[,.;:!?\"'“”‘’()\[\]{}]+$"
LEADING_SUPERSCRIPT_NUMBER = r'^[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*'
UNDERSCORE_WRAP = r'__([^_\n]+?)__'
TRAILING_EM_SUBTITLE = r'^(.*?)(?:\s*)<em>([^<]+)</em>\s*$'
EMPTY_ITALIC_GAP = r'\*\s+\*'
ESCAPED_SPECIAL = r'\\([!\.\[\]\*])'
BROKEN_ITALIC_TRAILING_SPACE = r'\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\']*)\s+\*(?=[^*]|$)'
BROKEN_ITALIC_LEADING_SPACE = r'(\s)\*\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\']*)\*'
BROKEN_ITALIC_LEADING_SPACE_START = r'^\*\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\']*)\*'
BROKEN_ITALIC_SPLIT_WORD = r'([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF]+)\*\s+\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])'
BROKEN_ITALIC_SPLIT_PUNCT = r'([,\.;:])\*\s+\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])'
SINGLE_WORD_ITALIC_PATTERN = r'\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\']*)\*'
ORPHAN_ITALIC_SPLIT = r'([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF,\.;:]+)\*\s+\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])'
ORPHAN_ITALIC_OPEN = r'(?<![A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF][A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF\-\'\s,\.;:]*?)(?=\s|$|[,\.;:\"\'])'
EM_ASTERISK_WRAPPER = r'\*(\s*(?:<em>[^<]*</em>\s*)+)\*'
STAR_BEFORE_EM = r'\*(?=\s*<em>)'
STAR_AFTER_EM = r'(?<=</em>)\*'
ORPHAN_STAR_BEFORE_BREAK = r'(?<=\S)\*(?=\s|$|[\.,;:!?])'
ORPHAN_STAR_AFTER_SPACE = r'(^|\s)\*(?=\S)'
WORD_BEFORE_EM = r'([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])(<em>)'
WORD_AFTER_EM = r'(</em>)([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])'
EM_INNER = r'<em>([^<]*)</em>'
EM_INNER_NONEMPTY = r'<em>([^<]+)</em>'
INLINE_FOOTNOTE_APPARATUS = r'\s\d+\.\s+[⁰¹²³⁴⁵⁶⁷⁸⁹]+:'
COMPOUND_FOOTNOTE_TERMS = (
    (r"Rúaj\s+Ha['']Kódesh", "Rúaj Ha'Kódesh"),
    (r"Ben\s+Ha['']Adam", "Ben Ha'Adam"),
    (r"Bet\s+Léjem", "Bet Léjem"),
    (r"Bet\s+Aniah", "Bet Aniah"),
)
POSTPROCESS_UNDERSCORE_ARTIFACTS = (
    (r'__\s+__', ' '),
    (r'__\*\s*\*__', ' '),
    (r'\*__\*\s*\*__', '*'),
    (r'__\*\s*\*', ' '),
    (r'\*\s*\*__', ' '),
)

TEHILIM_BOOK_DIVISION_RE = re.compile(
    r'__\s*(LIBRO\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO))\s*__',
    flags=re.IGNORECASE,
)
SHIR_HASHIRIM_ARTIFACT_RE = re.compile(
    r'\s*Final del cántico\.\s*Inicio del cántico\.?',
    flags=re.IGNORECASE,
)
DIVINE_NAME_LATIN_RE = re.compile(
    r'(?<![A-Za-zÁÉÍÓÚÜÑáéíóúüñ])(?:YEHOVAH|Yehovah|IEHOVAH|Iehovah)(?![A-Za-zÁÉÍÓÚÜÑáéíóúüñ])'
)
NESTED_EM_RE = re.compile(r'<em>([^<]*)<em>([^<]*)</em>([^<]*)</em>')