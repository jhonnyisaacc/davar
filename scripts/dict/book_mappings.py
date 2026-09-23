"""
Book mappings and metadata for Hebrew Scripture processing.

Names and codes load from data/knowledge/registries/books.json.
"""

from typing import Dict, Optional

from scripts.books import dict_book_mapping, morphhb_map


class BookMapper:
    """Handles book name mappings and metadata."""

    BOOK_MAPPING = dict_book_mapping()
    MORPHUS_BOOK_MAP = morphhb_map()

    @classmethod
    def get_book_info(cls, book_key: str) -> Optional[Dict]:
        """Get book information by key."""
        return cls.BOOK_MAPPING.get(book_key.lower())

    @classmethod
    def get_book_id(cls, book_info: Dict) -> str:
        """Get the book_id from book_info."""
        if 'book_id' in book_info:
            return book_info['book_id']
        # Generate from English name
        en_name = book_info.get('en', '')
        book_id = en_name.lower().replace(' ', '_')
        return book_id

    @classmethod
    def get_hebrew_translit(cls, book_info: Dict) -> str:
        """Get Hebrew transliteration prioritizing TTH, then TS2009."""
        # If TTH exists, use its capitalized name
        if book_info.get('tth'):
            tth_name = book_info['tth']
            # Handle compound names like "shemuel_alef" -> "Shemuel Alef"
            if '_' in tth_name:
                parts = tth_name.split('_')
                return ' '.join(part.capitalize() for part in parts)
            return tth_name.capitalize()

        # If TS2009 exists, extract first part before underscore
        if book_info.get('ts2009'):
            ts2009_name = book_info['ts2009']
            parts = ts2009_name.split('_')
            if parts:
                translit = parts[0]
                return translit.capitalize()

        # Fallback: capitalized English name
        return book_info.get('en', '').capitalize()

    @classmethod
    def get_all_book_keys(cls) -> list:
        """Get all available book keys."""
        return list(cls.BOOK_MAPPING.keys())
