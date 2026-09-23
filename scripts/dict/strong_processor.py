"""
Strong's number processing module.

Handles extraction, validation, and processing of Strong's numbers,
including morphological analysis and lexicon validation.
"""

import re
from typing import Dict, List, Optional, Set
from .config import config


class StrongProcessor:
    """Handles Strong's number processing and validation."""

    # Mapping of prefix codes to Strong's numbers for prepositions with pronominal suffixes
    PREFIX_TO_STRONG = {
        'Hb': 'H900',   # בְּ (be) - in, with
        'b': 'H900',    # בְּ (be) - in, with
        'Hl': 'H3808',  # לְ (le) - to, for
        'l': 'H3808',   # לְ (le) - to, for
        'Hc': 'H3605',  # כְּ (ke) - as, like
        'c': 'H3605',   # כְּ (ke) - as, like
        'Hm': 'H4480',  # מִן (min) - from
        'm': 'H4480',   # מִן (min) - from
    }

    def __init__(self):
        pass

    def extract_strong_number(self, lemma: str) -> Optional[str]:
        """
        Extract the Strong's number from a lemma.

        Examples:
            H1254 → H1254
            Hb/H7225 → H7225 (extracts H7225, ignoring prefix)
            Hc/H1961 → H1961
            Hc/Hd/H776 → H776
            Hb → H900 (preposition בְּ with pronominal suffix)
        """
        if not lemma:
            return None

        # Check if it's just a prefix code (like "Hb", "Hl") without a number
        # This happens with prepositions that have pronominal suffixes
        if lemma in self.PREFIX_TO_STRONG:
            return self.PREFIX_TO_STRONG[lemma]

        # Remove common prefixes (Hb/, Hc/, Hd/) to get to the actual number
        lemma_clean = re.sub(r'[Hh][bcdlm]/', '', lemma)

        # Extract Strong's number (format H followed by digits)
        match = re.search(r'[Hh](\d+)', lemma_clean)
        if match:
            return f"H{match.group(1)}"

        # If no number found but it's a known prefix, return the mapped Strong's
        if lemma in self.PREFIX_TO_STRONG:
            return self.PREFIX_TO_STRONG[lemma]

        return None

    def normalize_sense(self, sense: Optional[str]) -> Optional[str]:
        """
        Normalize the sense from morphus to simple format (without decimals).

        Examples:
            "1.0" -> "1"
            "1.1.1" -> "1"
            "0" -> "0"
            "0.0" -> "0"
            None -> None
        """
        if not sense:
            return None
        # Take only the first number before the dot
        parts = sense.split('.')
        return parts[0] if parts else None

    def get_lexicon_available_senses(self, strong_number: str) -> Set[str]:
        """
        Get all available senses from the lexicon for a Strong's number.

        Args:
            strong_number: Strong's number (e.g., "H1254")

        Returns:
            Set of available senses in the lexicon, or empty set if not found
        """
        if not strong_number:
            return set()

        available_senses = set()

        # Try draft/ directory first
        draft_file = config.LEXICON_DRAFT_DIR / f"{strong_number}.json"
        if draft_file.exists():
            try:
                with open(draft_file, 'r', encoding='utf-8') as f:
                    lexicon_data = f.read()
                    # Simple JSON parsing to avoid import issues
                    import json
                    lexicon_data = json.loads(lexicon_data)
                    definitions = lexicon_data.get('definitions', [])
                    for defn in definitions:
                        sense = defn.get('sense')
                        if sense:
                            available_senses.add(sense)
            except Exception:
                pass

        # Try roots/ directory
        if not available_senses:
            roots_file = config.LEXICON_ROOTS_DIR / f"{strong_number}.json"
            if roots_file.exists():
                try:
                    with open(roots_file, 'r', encoding='utf-8') as f:
                        lexicon_data = f.read()
                        import json
                        lexicon_data = json.loads(lexicon_data)
                        definitions = lexicon_data.get('definitions', [])
                        for defn in definitions:
                            sense = defn.get('sense')
                            if sense:
                                available_senses.add(sense)
                except Exception:
                    pass

        return available_senses

    def validate_sense(self, strong_number: str, sense: Optional[str]) -> Optional[str]:
        """
        Validate that a sense exists in the lexicon or has sub-senses.

        If morphus says "1" and lexicon has "1a", "1b", etc., then "1" is valid (parent category).
        Only returns None if the sense doesn't exist AND has no sub-senses.

        Args:
            strong_number: Strong's number (e.g., "H430")
            sense: Sense to validate (e.g., "1")

        Returns:
            Validated sense if it exists in lexicon or has sub-senses, None otherwise
        """
        if not sense or not strong_number:
            return None

        available_senses = self.get_lexicon_available_senses(strong_number)

        # If sense exists exactly in lexicon, return it
        if sense in available_senses:
            return sense

        # If sense doesn't exist, check if there are sub-senses
        # (e.g., sense="1" but lexicon has "1a", "1b")
        # If there are sub-senses, the parent sense "1" is valid
        has_sub_senses = any(s.startswith(sense) and len(s) > len(sense) for s in available_senses)

        if has_sub_senses:
            # The sense is a parent category (e.g., "1" is parent of "1a", "1b")
            return sense

        # Sense doesn't exist and no sub-senses found - invalid
        return None
