#!/usr/bin/env python3
"""
Bani Transliterator - Simple Hebrew transliteration for English and Spanish.

Provides a clean API for generating pronunciation guides from Hebrew text.
"""

from pathlib import Path
from typing import Dict, Any, Optional
import json
from pathlib import Path


from .apply import Transliterator


class BaniTransliterator:
    """Simple Hebrew transliterator for English and Spanish."""

    def __init__(self, language: str = "es"):
        """Initialize transliterator for given language.

        Args:
            language: Language code ('en' for English, 'es' for Spanish)
        """
        if language not in ("en", "es"):
            raise ValueError(f"Unsupported language: {language}. Use 'en' or 'es'.")

        self.language = language
        self.schema_path = Path(__file__).parent / "schemas" / f"{language}.json"

        if not self.schema_path.exists():
            raise FileNotFoundError(f"Schema not found: {self.schema_path}")

        with self.schema_path.open('r', encoding='utf-8') as f:
            self.schema = json.load(f)
        self.transliterator = Transliterator(self.schema)

    def transliterate(self, hebrew: str, strongs: str = "") -> str:
        """Transliterate Hebrew text to pronunciation guide.

        Args:
            hebrew: Hebrew text with nikud
            strongs: Strong's number (optional, for stress exceptions)

        Returns:
            Pronunciation guide with stress (e.g., "sha-LOM")
        """
        if not hebrew or not hebrew.strip():
            return ""

        result = self.transliterator.transliterate_word(hebrew, strongs)
        return result.get("guide", "")

    @staticmethod
    def for_all_languages(hebrew: str, strongs: str = "") -> Dict[str, str]:
        """Get transliterations for both English and Spanish.

        Args:
            hebrew: Hebrew text with nikud
            strongs: Strong's number (optional)

        Returns:
            Dict with 'en' and 'es' transliterations
        """
        en_transliterator = BaniTransliterator("en")
        es_transliterator = BaniTransliterator("es")

        return {
            "en": en_transliterator.transliterate(hebrew, strongs),
            "es": es_transliterator.transliterate(hebrew, strongs)
        }

    def transliterate_detailed(self, hebrew: str, strongs: str = "") -> Dict[str, Any]:
        """Get detailed transliteration result.

        Args:
            hebrew: Hebrew text with nikud
            strongs: Strong's number (optional)

        Returns:
            Dict with translit, guide, stress_syllable, etc.
        """
        if not hebrew or not hebrew.strip():
            return {
                'hebrew': hebrew,
                'translit': '',
                'stress_syllable': None,
                'guide': '',
                'guide_full': {
                    'reference': '',
                    'stress_note': '',
                    'phonetic_notes': []
                }
            }

        return self.transliterator.transliterate_word(hebrew, strongs)