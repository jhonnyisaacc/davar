"""
Configuration for Delitzsch Strong's Matcher
Defines paths to data directories and files
"""

import os
from pathlib import Path


# Base project directory
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Data directories
DATA_DIR = PROJECT_ROOT / "data"
DELITZSCH_DIR = DATA_DIR / "delitzsch"
OE_DIR = DATA_DIR / "oe"
DICT_DIR = DATA_DIR / "dict"

# Dictionary files
WORDS_JSON = DICT_DIR / "lexicon" / "words.json"
ROOTS_JSON = DICT_DIR / "lexicon" / "roots.json"
PREFIX_FORMS_JSON = DICT_DIR / "prefixes" / "forms_lookup.json"
PREFIX_ENTRIES_DIR = DICT_DIR / "prefixes" / "entries"

# Output directory
OUTPUT_DIR = DATA_DIR / "delitzsch" / "parsed"

# Log file
UNMATCHED_WORDS_LOG = PROJECT_ROOT / "scripts" / \
    "delitzsch" / "unmatched_words.log"

# SQLite database
SQLITE_DB = DELITZSCH_DIR / "raw" / ".SQLite3"


def ensure_output_dirs():
    """Create output directories if they don't exist"""
    for book_dir in DELITZSCH_DIR.glob("*.json"):
        book_name = book_dir.stem  # Remove .json extension
        output_book_dir = OUTPUT_DIR / book_name
        output_book_dir.mkdir(parents=True, exist_ok=True)


def get_book_files():
    """Get list of all Delitzsch book files"""
    return sorted(DELITZSCH_DIR.glob("*.json"))


def get_book_name(book_path):
    """Extract book name from file path"""
    return book_path.stem  # Remove .json extension
