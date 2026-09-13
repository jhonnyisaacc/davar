"""Map official TAGNT book codes to Davar Besorah book IDs."""

from __future__ import annotations

# TAGNT uses UBS-style abbreviations from the STEPBible-Data README.
# Davar Besorah IDs match scripts/generate-static-data/config.py DELITZSCH_TO_ENGLISH.
TAGNT_TO_DAVAR: dict[str, str] = {
    "Mat": "matthew",
    "Mrk": "mark",
    "Luk": "luke",
    "Jhn": "john",
    "Act": "acts",
    "Rom": "romans",
    "1Co": "corinthians1",
    "2Co": "corinthians2",
    "Gal": "galatians",
    "Eph": "ephesians",
    "Php": "philippians",
    "Col": "colossians",
    "1Th": "thessalonians1",
    "2Th": "thessalonians2",
    "1Ti": "timothy1",
    "2Ti": "timothy2",
    "Tit": "titus",
    "Phm": "philemon",
    "Heb": "hebrews",
    "Jas": "james",
    "1Pe": "peter1",
    "2Pe": "peter2",
    "1Jn": "john1",
    "2Jn": "john2",
    "3Jn": "john3",
    "Jud": "jude",
    "Rev": "revelation",
}

DAVAR_TO_TAGNT: dict[str, str] = {value: key for key, value in TAGNT_TO_DAVAR.items()}

BESORAH_BOOK_COUNT = 27


def davar_book_id(tagnt_book: str) -> str:
    try:
        return TAGNT_TO_DAVAR[tagnt_book]
    except KeyError as exc:
        raise KeyError(f"Unknown TAGNT book code: {tagnt_book}") from exc


def tagnt_book_code(davar_book_id_value: str) -> str:
    try:
        return DAVAR_TO_TAGNT[davar_book_id_value]
    except KeyError as exc:
        raise KeyError(f"Unknown Davar Besorah book id: {davar_book_id_value}") from exc
