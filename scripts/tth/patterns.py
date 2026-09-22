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