"""
Configuration module for v2 Strong's assignment system.
"""

from typing import List


from scripts.dict.config import Config

config = Config()

# Paths
PARSED_DIR = config.DATA_DIR / "delitzsch" / "parsed"
OUTPUT_DIR = PARSED_DIR / "strongs" / "v2"
DICTIONARY_PATH = config.DATA_DIR / "dict" / "raw" / "dict_backup" / "raw" / "strongs_hebrew_dict_en.json"

# All 27 NT books in Delitzsch translation
ALL_BOOKS = [
    'matthew', 'mark', 'luke', 'john', 'acts',
    'romans', 'corinthians1', 'corinthians2', 'galatians',
    'ephesians', 'philippians', 'colossians', 'thessalonians1',
    'thessalonians2', 'timothy1', 'timothy2', 'titus',
    'philemon', 'hebrews', 'james', 'peter1', 'peter2',
    'john1', 'john2', 'john3', 'jude', 'revelation'
]

# Hebrew letter codepoints: alef (U+05D0) to tav (U+05EA)
HEBREW_LETTERS = set(range(0x05D0, 0x05EB))

# Prefix codes and their Hebrew consonants
PREFIX_MAP = {
    'Hl': 'ל',  # lamed
    'Hb': 'ב',  # bet
    'Hk': 'כ',  # kaf
    'Hc': 'ו',  # vav (conjunction)
    'Hd': 'ה',  # he (definite article)
    'Hm': 'מ',  # mem (from)
}

# Minimum stem length for matching
MIN_STEM_LENGTH = 2

# Confidence thresholds
HIGH_CONFIDENCE_MIN = 3  # Minimum occurrences for high confidence
HIGH_CONFIDENCE_DOMINANCE = 0.80  # Minimum dominance ratio for auto-assign

# Common pronominal suffixes to detect (don't assign Strong's to these)
PRONOMINAL_SUFFIXES = {
    'י': '1cs',    # me
    'ך': '2ms',    # you (m.sg)
    'ךְ': '2fs',   # you (f.sg)
    'ו': '3ms',    # him/it
    'הּ': '3fs',   # her/it
    'נוּ': '1cp',  # us
    'כֶם': '2mp',  # you (m.pl)
    'כֶן': '2fp',  # you (f.pl)
    'ם': '3mp',    # them (m)
    'ן': '3fp',    # them (f)
    'ךָ': '2ms',
    'הוּ': '3ms',
    'הָ': '3fs',
    'כָם': '2mp',
    'כָן': '2fp',
    'מוֹ': '3mp',
}

# Prepositions that combine with suffixes
PREPOSITION_LETTERS = {'ב', 'ל', 'מ', 'כ'}  # bet, lamed, mem, kaf

def validate_dictionary() -> bool:
    """Check if the dictionary file exists."""
    return DICTIONARY_PATH.exists()