"""
TS2009 Processor Configuration

Contains all configuration constants, book mappings, and processing settings
for the TS2009 Bible processor.
"""

from typing import Dict, Any


import os
from pathlib import Path

from scripts.books import ts2009_mapping

# Get the project root directory (parent of scripts directory)
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Database settings
DEFAULT_DB_PATH = PROJECT_ROOT / 'data/ts2009/raw/TS2009_Sent to DABAR.bbli'
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / 'data/ts2009'
DEFAULT_TEMP_DIR = PROJECT_ROOT / 'data/ts2009/temp'

# Processing settings
PROCESSOR_VERSION = "3.0.0"


# Book mappings - TS2009 book numbers to metadata.
# Names and codes load from data/knowledge/registries/books.json.
BOOKS_MAPPING: Dict[int, Dict[str, Any]] = ts2009_mapping()


# Section mappings
SECTIONS_MAPPING = {
    'torah': {
        'hebrew': 'תורה',
        'english': 'Torah',
        'spanish': 'Torá'
    },
    'neviim': {
        'hebrew': 'נביאים',
        'english': 'Prophets',
        'spanish': 'Profetas'
    },
    'ketuvim': {
        'hebrew': 'כתובים',
        'english': 'Writings',
        'spanish': 'Escritos'
    },
    'besorah': {
        'hebrew': 'בשורה',
        'english': 'Gospel/Good News',
        'spanish': 'Evangelio/Buena Noticia'
    }
}


# Common Hebrew terms for extraction (simplified for the streamlined version)
COMMON_HEBREW_TERMS = {
    'יהוה': 'Tetragrammaton - Name of Elohim',
    'אלהים': 'Elohim - Mighty One, God',
    'אל': 'El - God, mighty one',
    'יהושע': 'Yehoshua - Salvation of Yah',
    'משיח': 'Messiah - The Anointed One'
}
