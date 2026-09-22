"""
Configuration for BES (Biblia en Español Sencillo) processing.

USFX codes and book metadata load from data/knowledge/registries/books.json.
"""

from typing import Any, Dict

from scripts.books import book_metadata, usfx_to_english

USFX_TO_ENGLISH = usfx_to_english()
BOOK_METADATA = book_metadata()
ENGLISH_TO_USFX = {value: key for key, value in USFX_TO_ENGLISH.items()}


def get_book_metadata(book_name: str) -> Dict[str, Any]:
    """Get metadata for a canonical English book name"""
    return BOOK_METADATA.get(book_name)


def get_usfx_code(book_name: str) -> str:
    """Get USFX 3-letter code for a canonical English book name"""
    return ENGLISH_TO_USFX.get(book_name)


def get_english_name(usfx_code: str) -> str:
    """Get canonical English name for a USFX 3-letter code"""
    return USFX_TO_ENGLISH.get(usfx_code)
