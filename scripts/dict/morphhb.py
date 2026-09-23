"""
Morphus XML data loader.

Handles loading and processing of morphological analysis data from
Open Scriptures MorphHB XML files.
"""

import xml.etree.ElementTree as ET
from typing import Dict, Optional
from .config import config
from .book_mappings import BookMapper
from .strong_processor import StrongProcessor


class MorphusLoader:
    """Handles loading and processing of morphus XML data."""

    def __init__(self, strong_processor: StrongProcessor):
        self.strong_processor = strong_processor

    def load_morphus_senses(self, book_key: str) -> Optional[Dict[str, Dict[str, str]]]:
        """
        Load BDB senses from the morphus XML file.

        Returns:
            Dict with structure: {verse_ref: {position: sense}}
            Example: {"genesis.1.1": {"1": "1", "2": None, ...}}
            Senses are normalized to simple format (without decimals)
        """
        morphus_file = BookMapper.MORPHUS_BOOK_MAP.get(book_key)
        if not morphus_file:
            return None

        xml_path = config.MORPHUS_DIR / morphus_file
        if not xml_path.exists():
            return None

        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()

            # Namespace
            ns = {'osis': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}

            senses = {}

            # Get book name (full English book_id)
            book_info = BookMapper.get_book_info(book_key)
            if not book_info:
                return None
            book_id = BookMapper.get_book_id(book_info)

            # Iterate over all verses
            for verse in root.findall('.//osis:verse', ns):
                verse_id = verse.get('osisID', '')
                # Extract chapter and verse (e.g., "Gen.1.1" -> chapter=1, verse=1)
                parts = verse_id.split('.')
                if len(parts) >= 3:
                    chapter = parts[1]
                    verse_num = parts[2]
                    verse_ref = f"{book_id}.{chapter}.{verse_num}"

                    # Get all words in the verse
                    words = verse.findall('.//osis:w', ns)
                    verse_senses = {}

                    for pos, word in enumerate(words, start=1):
                        sense_raw = word.get('n')  # The 'n' attribute contains the BDB sense
                        # Normalize sense to simple format (without decimals)
                        sense = self.strong_processor.normalize_sense(sense_raw)
                        verse_senses[str(pos)] = sense

                    if verse_senses:
                        senses[verse_ref] = verse_senses

            return senses
        except Exception as e:
            print(f"Warning: Error loading morphus {xml_path}: {e}")
            return None
