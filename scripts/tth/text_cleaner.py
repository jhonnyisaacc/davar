#!/usr/bin/env python3
"""
TTH Text Cleaner Module
=======================

Provides text cleaning functions to fix common issues from document conversion:

1. Soft hyphens: Word breaks like "Is\\-rael" should become "Israel"
2. Spacing after punctuation: Ensure space after :;, when missing
3. Stuck words before connectors: "Ashdody" should be "Ashdod y"
4. Glued conjunction y: "levantaráy viviremos" should be "levantará y viviremos"

Author: Davar Project
"""

import re
import unicodedata
from typing import List, Tuple


# Singleton instance
_cleaner_instance = None


def get_cleaner():
    """Get the singleton TTHTextCleaner instance."""
    global _cleaner_instance
    if _cleaner_instance is None:
        _cleaner_instance = TTHTextCleaner()
    return _cleaner_instance


class TTHTextCleaner:
    """
    Cleans TTH text by fixing common conversion issues.
    """

    # Spanish/Hebrew connectors that might get stuck to previous words
    CONNECTORS = ['y', 'e', 'o', 'u', 'a', 'al', 'el', 'la',
                  'los', 'las', 'de', 'del', 'en', 'que', 'no', 'ni']

    # Punctuation that requires space after (if followed by non-space/non-newline)
    PUNCTUATION_NEED_SPACE = ['.', ':', ';', ',', '?', '!']

    # Hebrew character range for detection
    HEBREW_RANGE = '\u0590-\u05FF'

    def __init__(self):
        """Initialize the text cleaner."""
        # Build patterns
        self._build_patterns()

    def _build_patterns(self):
        """Build regex patterns for text cleaning."""
        # Pattern for soft hyphens (word\-continuation)
        # Matches: word ending with letter, then \-, then continuation starting with letter
        self.soft_hyphen_pattern = re.compile(
            r'([A-Za-zÁÉÍÓÚáéíóúñÑ])\\\-\s*([A-Za-zÁÉÍÓÚáéíóúñÑ])',
            re.MULTILINE
        )

        # Pattern for stuck connectors (like "Ashdody" -> "Ashdod y")
        # Only match if the connector is a full word and the preceding text is a proper noun
        connector_group = '|'.join(self.CONNECTORS)
        self.stuck_connector_pattern = re.compile(
            rf'([A-ZÁÉÍÓÚ][a-záéíóú]{{2,}})({connector_group})(?=\s+[A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])',
            re.UNICODE
        )

        # Pattern for missing space after punctuation
        # Matches punctuation followed by non-space, non-newline character
        self.punctuation_space_pattern = re.compile(
            rf'([{re.escape("".join(self.PUNCTUATION_NEED_SPACE))}])([^\s\n\r])',
            re.UNICODE
        )

    def fix_soft_hyphens(self, text: str) -> str:
        """
        Fix soft hyphens (word breaks) in text.

        Examples:
            "Is\\-rael" -> "Israel"
            "trans\\-gre\\-siones" -> "transgresiones"
            "fami\\-lias" -> "familias"

        Args:
            text: Input text with potential soft hyphens

        Returns:
            Text with soft hyphens removed and words joined
        """
        # Remove soft hyphens and join word parts
        # Handle multiple hyphens in same word
        result = text

        # Keep replacing until no more matches (handles chained hyphens)
        prev_result = None
        max_iterations = 10  # Safety limit
        iteration = 0

        while result != prev_result and iteration < max_iterations:
            prev_result = result
            result = self.soft_hyphen_pattern.sub(r'\1\2', result)
            iteration += 1

        return result

    def fix_punctuation_spacing(self, text: str) -> str:
        """
        Ensure proper spacing after punctuation marks (:, ;, ,).

        Examples:
            "dijo:יהוה" -> "dijo: יהוה"
            "Amón,y" -> "Amón, y"
            "ciudades;y" -> "ciudades; y"

        Args:
            text: Input text with potential spacing issues

        Returns:
            Text with proper spacing after punctuation
        """
        def add_space(match):
            punct = match.group(1)
            next_char = match.group(2)

            # Don't add space if next char is already punctuation, quote, or special
            if next_char in '.,;:!?"\')}]\\*_”’»':
                return punct + next_char

            # Don't add space before closing parenthesis or brackets
            if next_char in ')]}':
                return punct + next_char

            # Don't add space if next char is a newline marker
            if next_char in '\n\r':
                return punct + next_char

            return punct + ' ' + next_char

        return self.punctuation_space_pattern.sub(add_space, text)

    def fix_inverted_punctuation_spacing(self, text: str) -> str:
        """
        Normalize spacing around Spanish inverted punctuation.

        Examples:
            "¡ Elohim mío!" -> "¡Elohim mío!"
            "¿ Quién?" -> "¿Quién?"
            "¡Elohim mío !" -> "¡Elohim mío!"
        """
        result = text

        # Remove spacing after opening inverted punctuation.
        result = re.sub(r'([¡¿])\s+', r'\1', result)

        # Remove spacing before closing punctuation.
        result = re.sub(r'\s+([!?])', r'\1', result)

        return result

    # Words that should NEVER be split (Hebrew/Biblical names ending with connectors)
    PROTECTED_WORDS = {
        'Yeshúa', 'Yeshua', 'Iehudáh', 'Iehudah', 'יהוה',
        'Tzefaniah', 'Tzefaniáh', 'Malaquías', 'Malaquiah', 'Obadiah',
        'Ieshaiáhu', 'Ieshaiahu', 'Irmeiáhu', 'Irmeiahu', 'Iejezkel',
        'Zejariah', 'Zejaríah', 'Mijael', 'Mijaél', 'Gavriel', 'Gavriél',
        'Elohim', 'Adonai', 'Shaddai', 'Tzebaoat', 'Tzebaot',
        'Iaacob', 'Iaácob', 'Esau', 'Esaú', 'Moab', 'Amón',
        'Sedom', 'Gamoráh', 'Gamorá', 'Sodoma', 'Gomorra',
        'Moshéh', 'Moisés', 'Bilam', 'Koraj', 'Janoj',
        # Additional pattern: any word with accented vowel before final letter
    }

    # Valid words in Spanish/transliterated text that naturally end with "y".
    # These must not be split into "... y".
    VALID_WORDS_ENDING_IN_Y = {
        'rey', 'ley', 'buey', 'hoy', 'muy', 'voy', 'soy', 'estoy', 'doy', 'hay', 'ay',
        'sinay', 'lajay', 'elay', 'uruguay', 'paraguay', 'convoy', 'jersey', 'carey', 'virrey',
    }

    # Valid words ending in "con" that must not be split.
    VALID_WORDS_ENDING_IN_CON = {
        'con',
    }

    def fix_stuck_connectors(self, text: str) -> str:
        """
        Fix words stuck to connectors like "Ashdody" -> "Ashdod y".

        This is a delicate operation - we only separate when:
        1. The preceding word looks like a proper noun (capitalized)
        2. The connector is followed by another word
        3. The resulting separation makes semantic sense
        4. The word is NOT a protected biblical name

        Examples:
            "Ashdody al que" -> "Ashdod y al que"
            "Guilada fin de" -> "Guilad a fin de"
            "Yeshúa el" -> "Yeshúa el" (NO CHANGE - protected)

        Args:
            text: Input text with potential stuck connectors

        Returns:
            Text with connectors properly separated
        """
        # For now, handle specific known cases to avoid over-correction
        # These are patterns that appear frequently in the TTH text

        known_stuck_words = [
            # (stuck pattern, correct form)
            (r'\bAshdody\b', 'Ashdod y'),
            # Only when followed by "fin"
            (r'\bGuilada\b(?=\s+fin)', 'Guilad a'),
            (r'\bjustoy\b', 'justo y'),
            (r'\bjovena\b', 'joven a'),
            (r'\bcasasy\b', 'casas y'),
            (r'\bpagaque\b', 'paga que'),
            (r'\btierraque\b', 'tierra que'),
        ]

        result = text
        for pattern, replacement in known_stuck_words:
            result = re.sub(pattern, replacement, result)

        # NOTE: Disabled general pattern - too aggressive and splits valid words
        # like "Padre" -> "Padr e" or "Yeshúa" -> "Yeshú a"
        # Only use explicit known cases above for safety

        return result

    def fix_stuck_final_y_conjunction(self, text: str) -> str:
        """
        Split glued final 'y' conjunctions like "levantaráy viviremos".

        This targets conversion artifacts where conjunction "y" was attached to
        the previous word. To avoid false positives, words that naturally end
        with "y" (e.g. "rey", "estoy", "buey") are whitelisted.
        """
        pattern = re.compile(
            r'\b([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}y)(?=\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])'
        )

        def split_if_needed(match):
            token = match.group(1)
            if token.lower() in self.VALID_WORDS_ENDING_IN_Y:
                return token
            return f"{token[:-1]} y"

        return pattern.sub(split_if_needed, text)

    def fix_stuck_final_con_preposition(self, text: str) -> str:
        """
        Split glued final 'con' prepositions like "díacon el".

        This targets conversion artifacts where "con" was attached to the
        previous word. A whitelist avoids splitting valid lexical endings.
        """
        pattern = re.compile(
            r'\b([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}con)(?=\s+(?:el|la|los|las|lo|un|una|unos|unas|su|sus|mi|mis|tu|tus|que|de|del|en|por|para|con|sin|a|al)\b)'
        )

        def split_if_needed(match):
            token = match.group(1)
            if token.lower() in self.VALID_WORDS_ENDING_IN_CON:
                return token
            return f"{token[:-3]} con"

        return pattern.sub(split_if_needed, text)

    def clean_verse_text(self, text: str) -> str:
        """
        Apply all text cleaning operations to verse text.

        This is the main entry point for cleaning verse content.

        Args:
            text: Raw verse text from processing

        Returns:
            Cleaned verse text
        """
        if not text or not text.strip():
            return text

        result = text

        # Normalize Unicode composition (DOCX conversion can mix decomposed
        # accents, e.g. di\u0301acon, which breaks regex-based corrections).
        result = unicodedata.normalize('NFC', result)

        # Order matters! Apply fixes in sequence:

        # 1. First fix soft hyphens (join broken words)
        result = self.fix_soft_hyphens(result)

        # 2. Then fix stuck connectors (separate words)
        result = self.fix_stuck_connectors(result)

        # 3. Fix glued conjunction y artifacts
        result = self.fix_stuck_final_y_conjunction(result)

        # 4. Fix glued preposition con artifacts
        result = self.fix_stuck_final_con_preposition(result)

        # 5. Finally fix punctuation spacing
        result = self.fix_punctuation_spacing(result)

        # 6. Normalize spacing around inverted/question punctuation
        result = self.fix_inverted_punctuation_spacing(result)

        # 7. Clean up any double spaces that might have been introduced
        result = re.sub(r'  +', ' ', result)

        # 8. Clean up spaces before punctuation
        result = re.sub(r'\s+([.,;:!?])', r'\1', result)

        return result.strip()


# Convenience functions for direct use
def clean_text(text: str) -> str:
    """
    Clean TTH text by fixing common conversion issues.

    Args:
        text: Input text to clean

    Returns:
        Cleaned text
    """
    cleaner = get_cleaner()
    return cleaner.clean_verse_text(text)


def fix_soft_hyphens(text: str) -> str:
    """Fix soft hyphens in text."""
    cleaner = get_cleaner()
    return cleaner.fix_soft_hyphens(text)


def fix_punctuation_spacing(text: str) -> str:
    """Fix punctuation spacing in text."""
    cleaner = get_cleaner()
    return cleaner.fix_punctuation_spacing(text)


def fix_stuck_connectors(text: str) -> str:
    """Fix stuck connectors in text."""
    cleaner = get_cleaner()
    return cleaner.fix_stuck_connectors(text)


def fix_stuck_final_y_conjunction(text: str) -> str:
    """Fix glued final y conjunction artifacts in text."""
    cleaner = get_cleaner()
    return cleaner.fix_stuck_final_y_conjunction(text)


def fix_stuck_final_con_preposition(text: str) -> str:
    """Fix glued final con preposition artifacts in text."""
    cleaner = get_cleaner()
    return cleaner.fix_stuck_final_con_preposition(text)


# Test cases when run directly
if __name__ == '__main__':
    print("TTH Text Cleaner - Test Cases")
    print("=" * 50)

    cleaner = TTHTextCleaner()

    # Test soft hyphens
    test_cases_hyphens = [
        ("Is\\-rael", "Israel"),
        ("sobre Is\\-rael en días", "sobre Israel en días"),
        ("las fami\\-lias de la tierra", "las familias de la tierra"),
        ("sus ro\\-pas ataron", "sus ropas ataron"),
    ]

    print("\n1. Soft Hyphen Tests:")
    for input_text, expected in test_cases_hyphens:
        result = cleaner.fix_soft_hyphens(input_text)
        status = "✓" if result == expected else "✗"
        print(f"  {status} '{input_text}' -> '{result}' (expected: '{expected}')")

    # Test punctuation spacing
    test_cases_punct = [
        ("dijo:יהוה", "dijo: יהוה"),
        ("Amón,y por", "Amón, y por"),
        ("estruendo) Moab", "estruendo) Moab"),  # Don't add space after )
    ]

    print("\n2. Punctuation Spacing Tests:")
    for input_text, expected in test_cases_punct:
        result = cleaner.fix_punctuation_spacing(input_text)
        status = "✓" if result == expected else "✗"
        print(f"  {status} '{input_text}' -> '{result}' (expected: '{expected}')")

    # Test stuck connectors
    test_cases_stuck = [
        ("habitante de Ashdody al que", "habitante de Ashdod y al que"),
    ]

    print("\n3. Stuck Connector Tests:")
    for input_text, expected in test_cases_stuck:
        result = cleaner.fix_stuck_connectors(input_text)
        status = "✓" if result == expected else "✗"
        print(f"  {status} '{input_text}' -> '{result}' (expected: '{expected}')")

    # Test glued final y conjunctions
    test_cases_glued_y = [
        ("nos levantaráy viviremos delante de Él",
         "nos levantará y viviremos delante de Él"),
        ("consumió sus postesy los devoró", "consumió sus postes y los devoró"),
        ("el rey de Israel", "el rey de Israel"),
        ("yo estoy contigo", "yo estoy contigo"),
    ]

    print("\n4. Glued Final Y Tests:")
    for input_text, expected in test_cases_glued_y:
        result = cleaner.fix_stuck_final_y_conjunction(input_text)
        status = "✓" if result == expected else "✗"
        print(f"  {status} '{input_text}' -> '{result}' (expected: '{expected}')")

    # Test glued final con prepositions
    test_cases_glued_con = [
        ("en aquel díacon el animal", "en aquel día con el animal"),
        ("de su santidadcon las fuerzas", "de su santidad con las fuerzas"),
    ]

    print("\n5. Glued Final Con Tests:")
    for input_text, expected in test_cases_glued_con:
        result = cleaner.fix_stuck_final_con_preposition(input_text)
        status = "✓" if result == expected else "✗"
        print(f"  {status} '{input_text}' -> '{result}' (expected: '{expected}')")

    # Full clean test
    print("\n6. Full Clean Test:")
    full_test = "Y dijo:יהוה desde Tzión rugirá,y desde Is\\-rael"
    full_expected = "Y dijo: יהוה desde Tzión rugirá, y desde Israel"
    full_result = cleaner.clean_verse_text(full_test)
    status = "✓" if full_result == full_expected else "✗"
    print(f"  {status}")
    print(f"  Input:    '{full_test}'")
    print(f"  Result:   '{full_result}'")
    print(f"  Expected: '{full_expected}'")
