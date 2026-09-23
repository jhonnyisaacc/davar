#!/usr/bin/env python3
"""
TTH JSON Post-Processor
=======================

Post-processes TTH2 JSON files to:
1. Convert markdown italics (*word*) to HTML <em> tags
2. Fix broken italic patterns from DOCX conversion
3. Remove escaped parentheses and other artifacts
4. Clean soft hyphens

For use with React Native apps using react-native-render-html.

Author: Davar Project
"""

import copy
import json
import re
import sys
import shutil
from pathlib import Path
from typing import Dict, Any, List, Tuple

try:
    from .text_cleaner import get_cleaner
except ImportError:
    try:
        from text_cleaner import get_cleaner
    except ImportError:
        def get_cleaner():
            return None

_PATTERN_NAMES = (
    "BOLD_SPAN_LAZY",
    "BROKEN_ITALIC_LEADING_SPACE",
    "BROKEN_ITALIC_LEADING_SPACE_START",
    "BROKEN_ITALIC_SPLIT_PUNCT",
    "BROKEN_ITALIC_SPLIT_WORD",
    "BROKEN_ITALIC_TRAILING_SPACE",
    "DIVINE_NAME_LATIN_RE",
    "DOUBLE_SPACE",
    "EMPTY_ITALIC_GAP",
    "EM_ASTERISK_WRAPPER",
    "EM_INNER",
    "EM_INNER_NONEMPTY",
    "EM_TAG",
    "ESCAPED_SPECIAL",
    "HEBREW_DIACRITICS",
    "INLINE_FOOTNOTE_APPARATUS",
    "ITALIC_SPAN_LAZY",
    "LATIN_LETTER",
    "LEADING_EDGE_PUNCT",
    "LEADING_SUPERSCRIPT_NUMBER",
    "MULTI_SPACE",
    "NESTED_EM_RE",
    "ORPHAN_ITALIC_OPEN",
    "ORPHAN_ITALIC_SPLIT",
    "ORPHAN_STAR_AFTER_SPACE",
    "ORPHAN_STAR_BEFORE_BREAK",
    "POSTPROCESS_UNDERSCORE_ARTIFACTS",
    "SHIR_HASHIRIM_ARTIFACT_RE",
    "SINGLE_WORD_ITALIC_PATTERN",
    "SPACE_BEFORE_PUNCT",
    "STAR_AFTER_EM",
    "STAR_BEFORE_EM",
    "TEHILIM_BOOK_DIVISION_RE",
    "TRAILING_EDGE_PUNCT",
    "TRAILING_EM_SUBTITLE",
    "UNDERSCORE_WRAP",
    "WHITESPACE",
    "WORD_AFTER_EM",
    "WORD_BEFORE_EM",
)

try:
    from . import patterns as _patterns
except ImportError:
    import patterns as _patterns

globals().update({name: getattr(_patterns, name) for name in _PATTERN_NAMES})

# Default paths
DEFAULT_JSON_DIR = Path(__file__).parent.parent.parent / \
    "data" / "tth" / "json"

# Singleton instances
_postprocessor_instances = {}


def _strip_hebrew_diacritics(text: str) -> str:
    """Remove Hebrew niqqud/cantillation marks for robust comparisons."""
    return re.sub(HEBREW_DIACRITICS, '', text or '')


def get_postprocessor(verbose: bool = False):
    """Get the singleton TTHJsonPostProcessor instance."""
    key = str(verbose)
    if key not in _postprocessor_instances:
        _postprocessor_instances[key] = TTHJsonPostProcessor(verbose=verbose)
    return _postprocessor_instances[key]


class TTHJsonPostProcessor:
    """
    Post-processes TTH2 JSON files to convert markdown to HTML
    and fix formatting issues.
    """

    BLOCKED_SUBTITLE_PHRASES = (
        'el que podía',
        'serán los de',
        'fiesta de las',
        'no la verán',
        'para que esté',
        'de la casa',
    )

    DIVINE_NAME_BASE_FORMS = {
        'יהוה',
    }

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.text_cleaner = get_cleaner()
        self.stats = {
            'soft_hyphens': 0,
            'apostrophes_normalized': 0,
            'underscore_artifacts': 0,
            'escaped_parens': 0,
            'escaped_special_chars': 0,
            'embedded_footnotes_removed': 0,
            'broken_italics': 0,
            'italics_converted': 0,
            'em_inner_whitespace_trimmed': 0,
            'em_spacing_fixed': 0,
            'subtitle_segments_extracted': 0,
            'subtitle_verses_created': 0,
            'subtitle_segments_skipped_wordcount': 0,
            'subtitle_segments_skipped_lowercase': 0,
            'subtitle_segments_skipped_phrase': 0,
            'subtitle_invalid_removed': 0,
            'divine_name_normalized': 0,
            'divine_name_markdown_wrappers_removed': 0,
            'book_divisions_extracted': 0,
            'stuck_final_y_fixed': 0,
            'verses_processed': 0,
            'files_processed': 0,
        }

    def extract_tehilim_book_division_marker(self, text: str) -> Tuple[str, str]:
        """
        Extract Tehilim book division labels from verse text.

        Returns:
            (cleaned_text, book_division_label)
        """
        if not text:
            return text, ''

        match = TEHILIM_BOOK_DIVISION_RE.search(text)
        if not match:
            return text, ''

        book_division = match.group(1).upper().strip()
        cleaned = (text[:match.start()] + text[match.end():]).strip()
        cleaned = re.sub(MULTI_SPACE, ' ', cleaned)
        cleaned = re.sub(SPACE_BEFORE_PUNCT, r'\1', cleaned)
        self.stats['book_divisions_extracted'] += 1
        return cleaned, book_division

    def normalize_divine_name_forms(self, text: str) -> str:
        """Normalize Latin divine-name spellings to the Hebrew form יהוה."""
        if not text:
            return text

        pattern = DIVINE_NAME_LATIN_RE
        matches = list(pattern.finditer(text))
        if matches:
            self.stats['divine_name_normalized'] += len(matches)
        return pattern.sub('יהוה', text)

    def remove_markdown_wrappers_from_divine_name(self, text: str) -> str:
        """
        Remove markdown-style double-underscore wrappers from standalone
        divine-name tokens, while preserving inner punctuation/content.

        Examples:
        - __יהוה__ -> יהוה
        - __יהוה__, -> יהוה,
        - __"יהוה"__ -> "יהוה"
        """
        if not text or '__' not in text:
            return text

        def unwrap_if_divine_name(match):
            inner = match.group(1)
            raw = inner.strip()
            token = raw
            token = re.sub(EM_TAG, '', token, flags=re.IGNORECASE)
            token = token.replace('*', '')
            token = re.sub(LEADING_EDGE_PUNCT, "", token)
            token = re.sub(TRAILING_EDGE_PUNCT, "", token)
            token_no_num = re.sub(LEADING_SUPERSCRIPT_NUMBER, '', token)
            had_numeric_prefix = token_no_num != token
            token = token_no_num
            normalized = _strip_hebrew_diacritics(token)
            if normalized in self.DIVINE_NAME_BASE_FORMS:
                self.stats['divine_name_markdown_wrappers_removed'] += 1
                cleaned_inner = re.sub(
                    EM_TAG, '', raw, flags=re.IGNORECASE)
                cleaned_inner = cleaned_inner.replace('*', '')
                cleaned_inner = re.sub(
                    LEADING_SUPERSCRIPT_NUMBER, '', cleaned_inner).strip()
                if had_numeric_prefix:
                    return f" {cleaned_inner}"
                return cleaned_inner
            return match.group(0)

        return re.sub(UNDERSCORE_WRAP, unwrap_if_divine_name, text)

    def starts_with_lowercase_latin(self, content: str) -> bool:
        """Return True when the first Latin letter in content is lowercase."""
        first_letter = re.search(LATIN_LETTER, content)
        if not first_letter:
            return False
        letter = first_letter.group(0)
        return letter.islower()

    def starts_with_blocked_subtitle_phrase(self, content: str) -> bool:
        """Return True when content starts with a known in-verse phrase."""
        normalized = content.strip().lower()
        return any(normalized.startswith(phrase) for phrase in self.BLOCKED_SUBTITLE_PHRASES)

    def is_valid_subtitle(self, content: str) -> bool:
        """Keep only clear heading-like subtitles and drop known false positives."""
        cleaned = content.strip()
        if not cleaned:
            return False
        if self.starts_with_lowercase_latin(cleaned):
            return False
        if self.starts_with_blocked_subtitle_phrase(cleaned):
            return False
        return True

    def count_words(self, text: str) -> int:
        """Count words in a subtitle candidate, trimming edge punctuation."""
        if not text:
            return 0

        tokens = re.split(WHITESPACE, text.strip())
        cleaned_tokens = []
        strip_chars = ".,;:!?\"'“”‘’()[]{}"
        for token in tokens:
            cleaned = token.strip(strip_chars)
            if cleaned:
                cleaned_tokens.append(cleaned)

        return len(cleaned_tokens)

    def extract_subtitle_from_italics(self, text: str) -> Tuple[str, str, int]:
        """
        Extract trailing italicized heading-like segments into subtitle.

        This is intentionally conservative: only trailing <em>...</em> spans are
        considered to avoid moving in-verse explanatory italics.

        Returns:
            Tuple of (updated_text, subtitle, extracted_segment_count)
        """
        if not text:
            return text, '', 0

        result = text.rstrip()
        subtitle_parts: List[str] = []
        extracted_segments = 0

        while True:
            match = re.search(
                TRAILING_EM_SUBTITLE, result, flags=re.DOTALL)
            if not match:
                break

            prefix = match.group(1).rstrip()
            content = match.group(2).strip()
            word_count = self.count_words(content)

            if word_count < 3:
                self.stats['subtitle_segments_skipped_wordcount'] += 1
                break

            if self.starts_with_lowercase_latin(content):
                self.stats['subtitle_segments_skipped_lowercase'] += 1
                break

            if self.starts_with_blocked_subtitle_phrase(content):
                self.stats['subtitle_segments_skipped_phrase'] += 1
                break

            subtitle_parts.insert(0, content)
            result = prefix
            extracted_segments += 1

        if extracted_segments == 0:
            return text, '', 0

        result = re.sub(MULTI_SPACE, ' ', result)
        result = re.sub(SPACE_BEFORE_PUNCT, r'\1', result)
        result = result.strip()

        subtitle = ' '.join(subtitle_parts).strip()
        return result, subtitle, extracted_segments

    def remove_soft_hyphens(self, text: str) -> str:
        """
        Remove soft hyphen characters (U+00AD).
        These are invisible word-break hints from DOCX conversion.
        """
        count = text.count('\u00AD')
        self.stats['soft_hyphens'] += count
        return text.replace('\u00AD', '')

    def normalize_ascii_apostrophes(self, text: str) -> str:
        """
        Normalize smart apostrophes to plain ASCII apostrophe.

        - U+2018 LEFT SINGLE QUOTATION MARK -> '
        - U+2019 RIGHT SINGLE QUOTATION MARK -> '
        """
        if not text:
            return text

        replacements = text.count('\u2018') + text.count('\u2019')
        if replacements:
            self.stats['apostrophes_normalized'] += replacements

        return text.replace('\u2018', "'").replace('\u2019', "'")

    def fix_underscore_artifacts(self, text: str) -> str:
        """
        Remove underscore artifacts like __* *__ patterns.
        These are conversion errors from DOCX.
        """
        # Pattern: __* *__ or similar combinations
        patterns = POSTPROCESS_UNDERSCORE_ARTIFACTS

        result = text
        for pattern, replacement in patterns:
            matches = len(re.findall(pattern, result))
            self.stats['underscore_artifacts'] += matches
            result = re.sub(pattern, replacement, result)

        return result

    def fix_empty_italic_gaps(self, text: str) -> str:
        """
        Remove artifact markers like '* *' that appear as spacing placeholders
        between words and footnote markers after conversion.
        """
        matches = re.findall(EMPTY_ITALIC_GAP, text)
        self.stats['broken_italics'] += len(matches)
        return re.sub(EMPTY_ITALIC_GAP, ' ', text)

    def fix_escaped_parentheses(self, text: str) -> str:
        """
        Convert escaped parentheses \\( and \\) to regular ( and ).
        These appear in literal/alternative notes like (Lit.: ...) or (O, ...).
        """
        # Count before fixing
        count = text.count('\\(') + text.count('\\)')
        self.stats['escaped_parens'] += count

        # Replace escaped parens with regular ones
        result = text.replace('\\(', '(').replace('\\)', ')')
        return result

    def fix_escaped_special_chars(self, text: str) -> str:
        """
        Remove unnecessary escaping for punctuation/brackets that should render
        as literal characters in TTH JSON text.

        Examples:
        - \\! -> !
        - \\. -> .
        - \\[ -> [
        - \\] -> ]
        """
        pattern = ESCAPED_SPECIAL
        matches = re.findall(pattern, text)
        self.stats['escaped_special_chars'] += len(matches)
        return re.sub(pattern, r'\1', text)

    def normalize_double_asterisk_markup(self, text: str) -> str:
        """
        Remove leftover markdown bold wrappers (**...**) while preserving content.
        This prevents malformed sequences from interacting with italic conversion.
        """
        result = text
        matches = re.findall(BOLD_SPAN_LAZY, result)
        self.stats['broken_italics'] += len(matches)
        return re.sub(BOLD_SPAN_LAZY, r' \1 ', result)

    def normalize_broken_italics(self, text: str) -> str:
        """
        Fix broken italic patterns before converting to <em>.

        Patterns to fix:
        - *word * (space before closing) → *word*
        - * word* (space after opening) → *word*
        - word* *next (split markers) → word *next* or context-dependent
        """
        result = text

        # Pattern 1: *word * → *word* (trailing space inside)
        # Match: asterisk, word chars, space, asterisk, then non-asterisk or end
        pattern1 = BROKEN_ITALIC_TRAILING_SPACE
        matches1 = len(re.findall(pattern1, result))
        self.stats['broken_italics'] += matches1
        result = re.sub(pattern1, r'*\1* ', result)

        # Pattern 2: * word* → *word* (leading space inside)
        # Match: space or start of text, asterisk, space(s), word, asterisk
        # Use simpler pattern without variable-width lookbehind
        pattern2 = BROKEN_ITALIC_LEADING_SPACE
        matches2 = len(re.findall(pattern2, result))
        self.stats['broken_italics'] += matches2
        result = re.sub(pattern2, r'\1*\2*', result)

        # Also handle at start of string
        pattern2b = BROKEN_ITALIC_LEADING_SPACE_START
        matches2b = len(re.findall(pattern2b, result))
        self.stats['broken_italics'] += matches2b
        result = re.sub(pattern2b, r'*\1*', result)

        # Pattern 3: word* *next → handle split markers
        # This is trickier - often means the second word should be italic
        # Example: "bien* *todas" → "bien *todas*" (assuming todas should be italic)
        pattern3 = BROKEN_ITALIC_SPLIT_WORD
        matches3 = len(re.findall(pattern3, result))
        self.stats['broken_italics'] += matches3
        # Keep the first word normal, make the second italic
        result = re.sub(pattern3, r'\1 *\2', result)

        # Pattern 4: punctuation* *word (comma, period before split)
        # Example: "eso,* *pobres" → "eso, *pobres*"
        pattern4 = BROKEN_ITALIC_SPLIT_PUNCT
        matches4 = len(re.findall(pattern4, result))
        self.stats['broken_italics'] += matches4
        result = re.sub(pattern4, r'\1 *\2', result)

        # Clean up any double spaces introduced
        result = re.sub(DOUBLE_SPACE, ' ', result)

        return result

    def convert_italics_to_em(self, text: str) -> str:
        """
        Convert markdown italics *word* to HTML <em>word</em>.

        Handles:
        - Single words: *word* → <em>word</em>
        - Multi-word: *word1 word2* → <em>word1 word2</em>
        - Nested punctuation: *word,* → <em>word,</em>
        """
        # Pattern for italic content between asterisks
        # Match: * followed by content (not starting with space), followed by *
        # Content can include: letters, numbers, spaces, punctuation, Hebrew chars
        pattern = ITALIC_SPAN_LAZY

        def replace_italic(match):
            content = match.group(1).strip()
            if content:  # Don't convert empty italics
                self.stats['italics_converted'] += 1
                return f'<em>{content}</em>'
            return match.group(0)

        result = re.sub(pattern, replace_italic, text)
        return result

    def convert_single_word_italics(self, text: str) -> str:
        """
        Convert single-word italics *word* to <em>word</em> first.
        This handles cases like escribírte*las* correctly.
        """
        # Match *word* where word is a single word (no spaces)
        # This catches: *word*, *word*, *word*,  etc.
        pattern = SINGLE_WORD_ITALIC_PATTERN

        def replace_single(match):
            word = match.group(1)
            self.stats['italics_converted'] += 1
            return f'<em>{word}</em>'

        return re.sub(pattern, replace_single, text)

    def fix_orphan_asterisks(self, text: str) -> str:
        """
        Fix orphan asterisks that remain after single-word conversion.
        Patterns like: word* *next → word next (remove orphan markers)
        """
        result = text

        # Pattern: word* *word (orphan close then orphan open)
        # These are markers that didn't have matching pairs
        pattern1 = ORPHAN_ITALIC_SPLIT
        matches1 = len(re.findall(pattern1, result))
        self.stats['broken_italics'] += matches1
        result = re.sub(pattern1, r'\1 \2', result)

        # Pattern: remaining orphan asterisks at word boundaries
        # *word (orphan open) - if word is followed by non-asterisk
        pattern2 = ORPHAN_ITALIC_OPEN
        # This is tricky - we need to be careful not to remove legitimate patterns

        # For now, just clean up the common case: word* at end or before space
        # Only if not followed by matching close

        return result

    def strip_asterisks_around_em(self, text: str) -> str:
        """
        Remove leftover markdown asterisks wrapping or touching existing <em>
        tags, e.g. *<em>...</em>* -> <em>...</em>.
        """
        result = text

        # Full wrapper around one or more <em>...</em> segments.
        result = re.sub(EM_ASTERISK_WRAPPER, r'\1', result)

        # Partial wrappers touching opening/closing <em> tags.
        result = re.sub(STAR_BEFORE_EM, '', result)
        result = re.sub(STAR_AFTER_EM, '', result)

        return result

    def remove_orphan_asterisks(self, text: str) -> str:
        """
        Remove leftover orphan markdown asterisks after conversion.
        By this stage paired italics should already be converted to <em> tags,
        so remaining stars are usually conversion artifacts.
        """
        result = text

        # Orphan star before punctuation/space/end.
        result = re.sub(ORPHAN_STAR_BEFORE_BREAK, '', result)

        # Orphan star after whitespace or at string start before plain text.
        # Use a captured prefix instead of variable-width look-behind for
        # Python regex compatibility.
        result = re.sub(ORPHAN_STAR_AFTER_SPACE, r'\1', result)

        return result

    def fix_em_spacing(self, text: str) -> str:
        """
        Ensure proper spacing around <em> tags.

        This handles cases where <em> tags are joined to adjacent words
        without proper spacing, like "escribírte<em>las</em>" → "escribírte <em>las</em>"

        Rules:
        - Add space before <em> if preceded by letter/Hebrew without space
        - Add space after </em> if followed by letter/Hebrew without space
        - Don't add space if already there or followed by punctuation
        """
        result = text

        # Count fixes for statistics
        fixes_before = result.count('<em>') + result.count('</em>')

        # Pattern 1: Add space before <em> if preceded by word character without space
        # Match: word character immediately followed by <em>
        pattern1 = WORD_BEFORE_EM
        result = re.sub(pattern1, r'\1 \2', result)

        # Pattern 2: Add space after </em> if followed by word character without space
        # Match: </em> immediately followed by word character (but not punctuation)
        pattern2 = WORD_AFTER_EM
        result = re.sub(pattern2, r'\1 \2', result)

        # Count fixes made
        fixes_after = result.count('<em>') + result.count('</em>')
        self.stats['em_spacing_fixed'] += (fixes_after - fixes_before)

        # Clean up any double spaces that might have been created
        result = re.sub(DOUBLE_SPACE, ' ', result)

        return result

    def normalize_em_inner_whitespace(self, text: str) -> str:
        """
        Trim leading/trailing whitespace inside <em>...</em> content.

        Example:
        - <em>shekel. </em> -> <em>shekel.</em>
        """
        if not text or '<em>' not in text:
            return text

        def trim_inner(match):
            inner = match.group(1)
            trimmed = inner.strip()

            if trimmed != inner:
                self.stats['em_inner_whitespace_trimmed'] += 1

            # Drop empty emphasis wrappers after trimming.
            if not trimmed:
                return ''

            return f'<em>{trimmed}</em>'

        return re.sub(EM_INNER, trim_inner, text)

    def flatten_nested_em_tags(self, text: str) -> str:
        """Flatten accidental nested <em> tags into a single emphasis span."""
        result = text
        nested_pattern = NESTED_EM_RE
        while nested_pattern.search(result):
            result = nested_pattern.sub(r'<em>\1\2\3</em>', result)
        return result

    def remove_em_from_divine_name(self, text: str) -> str:
        """
        Remove emphasis wrappers from standalone divine-name tokens (e.g. יהוה).
        We keep the inner punctuation/content and only drop the <em> wrapper.
        """
        if not text or '<em>' not in text:
            return text

        def unwrap_if_divine_name(match):
            inner = match.group(1)
            token = inner.strip()
            token = re.sub(LEADING_EDGE_PUNCT, "", token)
            token = re.sub(TRAILING_EDGE_PUNCT, "", token)
            normalized = _strip_hebrew_diacritics(token)
            if normalized in self.DIVINE_NAME_BASE_FORMS:
                return inner
            return match.group(0)

        return re.sub(EM_INNER_NONEMPTY, unwrap_if_divine_name, text)

    def strip_embedded_footnotes_section(self, text: str) -> str:
        """
        Remove leaked markdown footnotes sections accidentally appended to verse
        text during conversion (e.g., "## Footnotes ...").
        """
        marker = '## Footnotes'
        idx = text.find(marker)
        if idx == -1:
            return text

        # If the marker is wrapped by runaway emphasis tags, trim from the
        # nearest doubled <em> start right before the marker.
        cut_idx = idx
        runaway_em_idx = text.rfind('<em><em>', 0, idx)
        if runaway_em_idx != -1 and (idx - runaway_em_idx) < 200:
            cut_idx = runaway_em_idx

        self.stats['embedded_footnotes_removed'] += 1
        return text[:cut_idx].rstrip()

    def strip_inline_footnote_blob(self, text: str) -> str:
        """
        Remove leaked inline numbered footnote apparatus from verse text.

        Corrupted verses can contain long sequences like:
        "... 1. ¹: ... 2. ²: ..."

        This trims from the first apparatus marker when the verse is abnormally
        long, keeping normal verse content intact.
        """
        if not text:
            return text

        if len(text) < 500:
            return text

        marker_match = re.search(INLINE_FOOTNOTE_APPARATUS, text)
        if not marker_match:
            return text

        # Require repeated inline markers to avoid clipping legitimate numbering.
        marker_count = len(re.findall(INLINE_FOOTNOTE_APPARATUS, text))
        if marker_count < 2:
            return text

        self.stats['embedded_footnotes_removed'] += 1
        return text[:marker_match.start()].rstrip()

    def rebalance_em_tags(self, text: str) -> str:
        """Drop dangling <em> or </em> tags left by malformed source markup."""
        result = text
        while result.count('<em>') > result.count('</em>'):
            pos = result.rfind('<em>')
            if pos == -1:
                break
            result = result[:pos] + result[pos + 4:]

        while result.count('</em>') > result.count('<em>'):
            pos = result.find('</em>')
            if pos == -1:
                break
            result = result[:pos] + result[pos + 5:]

        return result

    def cleanup_shir_hashirim_artifacts(self, text: str) -> str:
        """Remove repeated chant-boundary marker artifacts leaked into verse text."""
        if not text:
            return text

        cleaned = SHIR_HASHIRIM_ARTIFACT_RE.sub('', text)
        cleaned = re.sub(MULTI_SPACE, ' ', cleaned)
        cleaned = re.sub(SPACE_BEFORE_PUNCT, r'\1', cleaned)
        return cleaned.strip()

    def keep_single_word_emphasis_only(self, text: str) -> str:
        """For problematic sources, unwrap <em> spans that contain more than one word."""
        if not text or '<em>' not in text:
            return text

        def maybe_unwrap(match):
            content = match.group(1).strip()
            if not content:
                return content
            if len(content.split()) > 1:
                return content
            return f'<em>{content}</em>'

        return re.sub(EM_INNER_NONEMPTY, maybe_unwrap, text)

    def process_text(self, text: str) -> str:
        """
        Apply all processing steps to a text string.
        Order matters!
        """
        if not text or not text.strip():
            return text

        result = text

        # Step 1: Remove soft hyphens (clean raw text first)
        result = self.remove_soft_hyphens(result)

        # Step 2: Normalize smart apostrophes to ASCII apostrophe
        result = self.normalize_ascii_apostrophes(result)

        # Step 3: Fix underscore artifacts
        result = self.fix_underscore_artifacts(result)

        # Step 4: Remove empty markdown spacer artifacts (* *)
        result = self.fix_empty_italic_gaps(result)

        # Step 5: Fix escaped parentheses
        result = self.fix_escaped_parentheses(result)

        # Step 6: Remove unnecessary escaped punctuation/brackets
        result = self.fix_escaped_special_chars(result)

        # Step 7: Normalize leftover markdown bold wrappers
        result = self.normalize_double_asterisk_markup(result)

        # Step 8: Remove markdown wrappers from divine name tokens
        result = self.remove_markdown_wrappers_from_divine_name(result)

        # Step 9: Convert single-word italics FIRST (*word* → <em>word</em>)
        # This handles cases like escribírte*las* correctly
        result = self.convert_single_word_italics(result)

        # Step 10: Fix orphan asterisks (word* *next patterns)
        result = self.fix_orphan_asterisks(result)

        # Step 11: Strip stray asterisks around existing <em> tags
        result = self.strip_asterisks_around_em(result)

        # Step 12: Normalize any remaining broken italic patterns
        result = self.normalize_broken_italics(result)

        # Step 13: Convert any remaining *...* to <em>...</em>
        result = self.convert_italics_to_em(result)

        # Step 14: Remove orphan markdown stars left after conversion
        result = self.remove_orphan_asterisks(result)

        # Step 15: Fix spacing around <em> tags
        result = self.fix_em_spacing(result)

        # Step 16: Trim accidental inner whitespace in <em>...</em> spans
        result = self.normalize_em_inner_whitespace(result)

        # Step 17: Flatten accidental nested <em> tags
        result = self.flatten_nested_em_tags(result)

        # Step 18: Keep divine name unitalicized even if source markers wrapped it
        result = self.remove_em_from_divine_name(result)

        # Step 19: Normalize Latin divine-name forms to Hebrew
        result = self.normalize_divine_name_forms(result)

        # Step 20: Fix glued final-y conjunction artifacts at postprocess stage
        # too, so postprocess-only runs stay aligned with md->json cleaning.
        if self.text_cleaner is not None:
            before = result
            result = self.text_cleaner.fix_stuck_final_y_conjunction(result)
            if result != before:
                self.stats['stuck_final_y_fixed'] += 1

        # Step 21: Clean up any remaining issues
        result = re.sub(DOUBLE_SPACE, ' ', result)  # Double spaces
        result = result.strip()

        return result

    def process_verse(self, verse: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single verse entry."""
        self.stats['verses_processed'] += 1

        existing_subtitle = verse.get('subtitle', '').strip()
        if existing_subtitle and not self.is_valid_subtitle(existing_subtitle):
            del verse['subtitle']
            self.stats['subtitle_invalid_removed'] += 1
        elif existing_subtitle:
            subtitle = self.normalize_ascii_apostrophes(existing_subtitle)
            verse['subtitle'] = self.normalize_divine_name_forms(subtitle)

        # Process the main TTH text
        if 'tth' in verse and verse['tth']:
            verse['tth'] = self.process_text(verse['tth'])
            verse['tth'] = self.strip_inline_footnote_blob(verse['tth'])
            verse['tth'] = self.strip_embedded_footnotes_section(verse['tth'])
            verse['tth'] = self.rebalance_em_tags(verse['tth'])
            verse['tth'], extracted_subtitle, extracted_count = self.extract_subtitle_from_italics(
                verse['tth'])

            if extracted_count > 0 and extracted_subtitle:
                self.stats['subtitle_segments_extracted'] += extracted_count
                self.stats['subtitle_verses_created'] += 1

                existing_subtitle = verse.get('subtitle', '').strip()
                if existing_subtitle and self.is_valid_subtitle(existing_subtitle):
                    verse['subtitle'] = f"{existing_subtitle} {extracted_subtitle}".strip(
                    )
                else:
                    verse['subtitle'] = extracted_subtitle

        # Process footnote explanations (they may contain italics too)
        if 'footnotes' in verse:
            for footnote in verse['footnotes']:
                if 'explanation' in footnote and footnote['explanation']:
                    footnote['explanation'] = self.process_text(
                        footnote['explanation'])
                    footnote['explanation'] = self.rebalance_em_tags(
                        footnote['explanation'])
                if 'word' in footnote and footnote['word']:
                    normalized_word = self.normalize_ascii_apostrophes(
                        footnote['word'])
                    footnote['word'] = self.normalize_divine_name_forms(
                        normalized_word)

        return verse

    def apply_book_specific_cleanup(self, verse: Dict[str, Any], book_key: str) -> Dict[str, Any]:
        """Apply scoped cleanup rules for books with known source artifacts."""
        if 'tth' not in verse or not verse['tth']:
            return verse

        if book_key == 'shir_hashirim':
            verse['tth'] = self.cleanup_shir_hashirim_artifacts(verse['tth'])
            verse['tth'] = self.keep_single_word_emphasis_only(verse['tth'])

        return verse

    def process_book(self, data: Dict[str, Any], book_key: str) -> Dict[str, Any]:
        """Post-process one book dict in place and return it."""
        file_stats_before = dict(self.stats)

        if 'chapters' in data:
            is_tehilim = book_key == 'tehilim'
            pending_book_division = ''

            for chapter_index, chapter in enumerate(data['chapters']):
                if is_tehilim:
                    if chapter_index == 0 and not chapter.get('book_division'):
                        chapter['book_division'] = 'LIBRO PRIMERO'
                    if pending_book_division:
                        chapter['book_division'] = pending_book_division
                        pending_book_division = ''

                if 'verses' in chapter:
                    for i, verse in enumerate(chapter['verses']):
                        chapter['verses'][i] = self.process_verse(verse)
                        chapter['verses'][i] = self.apply_book_specific_cleanup(
                            chapter['verses'][i],
                            book_key,
                        )

                        if is_tehilim and chapter['verses'][i].get('tth'):
                            cleaned_tth, division = self.extract_tehilim_book_division_marker(
                                chapter['verses'][i]['tth']
                            )
                            if division:
                                chapter['verses'][i]['tth'] = cleaned_tth
                                pending_book_division = division

        self.last_file_stats = {
            key: self.stats[key] - file_stats_before[key]
            for key in self.stats
        }
        self.stats['files_processed'] += 1
        return data

    def print_file_result(self, book_name: str, file_stats: Dict[str, Any], success: bool = True):
        """Print one book's postprocess line. File I/O stays in the CLI."""
        if not success:
            print(f"  ✗ {book_name}: FAILED")
            return
        changes = sum(v for k, v in file_stats.items() if k !=
                      'verses_processed' and k != 'files_processed')
        if changes > 0 or self.verbose:
            print(
                f"  ✓ {book_name}: {file_stats['verses_processed']} verses, {changes} fixes")

    def print_summary(self, dry_run: bool = False):
        """Print processing summary."""
        prefix = "[DRY RUN] " if dry_run else ""
        print(f"\n{prefix}Processing Summary:")
        print(f"  Files processed:      {self.stats['files_processed']}")
        print(f"  Verses processed:     {self.stats['verses_processed']}")
        print(f"  Soft hyphens removed: {self.stats['soft_hyphens']}")
        print(
            f"  Apostrophes normalized: {self.stats['apostrophes_normalized']}")
        print(f"  Escaped parens fixed: {self.stats['escaped_parens']}")
        print(f"  Escaped chars fixed:  {self.stats['escaped_special_chars']}")
        print(
            f"  Footnote leaks fixed: {self.stats['embedded_footnotes_removed']}")
        print(f"  Broken italics fixed: {self.stats['broken_italics']}")
        print(f"  Italics → <em>:       {self.stats['italics_converted']}")
        print(f"  <em> spacing fixed:   {self.stats['em_spacing_fixed']}")
        print(
            f"  Subtitle segments:    {self.stats['subtitle_segments_extracted']}")
        print(
            f"  Subtitle verses:      {self.stats['subtitle_verses_created']}")
        print(
            f"  Subtitle skip (<3w):  {self.stats['subtitle_segments_skipped_wordcount']}")
        print(
            f"  Subtitle skip (lc):   {self.stats['subtitle_segments_skipped_lowercase']}")
        print(
            f"  Subtitle skip (phr):  {self.stats['subtitle_segments_skipped_phrase']}")
        print(
            f"  Invalid subtitles:    {self.stats['subtitle_invalid_removed']}")
        print(
            f"  Divine names norm.:   {self.stats['divine_name_normalized']}")
        print(
            f"  Book divisions moved: {self.stats['book_divisions_extracted']}")
        print(f"  Underscore artifacts: {self.stats['underscore_artifacts']}")


def postprocess_book(source: Any, book_key: str, verbose: bool = False) -> Dict[str, Any]:
    """
    Post-process one book.

    ``source`` is a book dict or JSON text. Returns a new dict.
    """
    if isinstance(source, str):
        data = json.loads(source)
    elif isinstance(source, dict):
        data = copy.deepcopy(source)
    else:
        raise TypeError("postprocess_book expects JSON text or a dict")
    return get_postprocessor(verbose=verbose).process_book(data, book_key)


def _write_book_json(path: Path, data: Dict[str, Any]) -> None:
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)


def _postprocess_path(processor: TTHJsonPostProcessor, file_path: Path, dry_run: bool, backup: bool) -> Tuple[bool, Dict[str, Any]]:
    """CLI helper: read one JSON file, post-process it, and write it back."""
    try:
        with open(file_path, 'r', encoding='utf-8') as handle:
            data = json.load(handle)
        processor.process_book(data, file_path.stem)
        if not dry_run:
            if backup:
                shutil.copy2(file_path, file_path.with_suffix('.json.bak'))
            _write_book_json(file_path, data)
        return True, processor.last_file_stats
    except Exception as exc:
        print(f"Error processing {file_path}: {exc}")
        return False, {}


def main():
    """Main entry point for CLI usage."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Post-process TTH2 JSON files to convert italics to <em> tags'
    )
    parser.add_argument(
        'target',
        help='Book name (e.g., "lukas") or "all" for all books'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would change without modifying files'
    )
    parser.add_argument(
        '--backup',
        action='store_true',
        help='Create .bak backup files before modifying'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Show detailed output for all files'
    )
    parser.add_argument(
        '--json-dir',
        type=Path,
        default=DEFAULT_JSON_DIR,
        help=f'Path to JSON directory (default: {DEFAULT_JSON_DIR})'
    )

    args = parser.parse_args()

    processor = TTHJsonPostProcessor(verbose=args.verbose)

    if args.target.lower() == 'all':
        json_files = sorted(args.json_dir.glob('*.json'))
        if not json_files:
            print(f"No JSON files found in {args.json_dir}")
            sys.exit(1)
        print(
            f"{'[DRY RUN] ' if args.dry_run else ''}Processing {len(json_files)} JSON files...")
        print("=" * 60)
        for file_path in json_files:
            file_ok, file_stats = _postprocess_path(
                processor, file_path, args.dry_run, args.backup)
            processor.print_file_result(file_path.stem, file_stats, file_ok)
        print("=" * 60)
        processor.print_summary(args.dry_run)
        success = True
    else:
        file_path = args.json_dir / f"{args.target}.json"
        if not file_path.exists():
            print(f"Error: File not found: {file_path}")
            sys.exit(1)

        print(f"{'[DRY RUN] ' if args.dry_run else ''}Processing {args.target}...")
        success, _file_stats = _postprocess_path(
            processor, file_path, args.dry_run, args.backup)
        processor.print_summary(args.dry_run)

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
