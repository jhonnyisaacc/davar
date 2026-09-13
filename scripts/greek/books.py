"""Map official TAGNT book codes to Davar Besorah book IDs."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB_METADATA = ROOT / "web" / "data" / "metadata.json"

# TAGNT uses UBS-style abbreviations from the STEPBible-Data README.
# Davar Besorah IDs match web/data/metadata.json and
# scripts/generate-static-data/config.py DELITZSCH_TO_ENGLISH.
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


def davar_besorah_ids_from_metadata(metadata_path: Path | None = None) -> list[str]:
    """Read Besorah book IDs from the shared web metadata used by web and mobile."""
    path = metadata_path or WEB_METADATA
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [book["id"] for book in payload["books"] if book.get("section") == "besorah"]


# TAGNT verse identities with rows but no SBL edition token at
# STEPBible-Data ae39711d7843b2902d54993e432de9c12d6a4b9a. Do not fill these
# from Hebrew Besorah or from NA28.
TAGNT_SBL_ABSENT_VERSES: tuple[str, ...] = (
    "Mat.17.21",
    "Mat.18.11",
    "Mat.23.14",
    "Mrk.7.16",
    "Mrk.9.44",
    "Mrk.9.46",
    "Mrk.11.26",
    "Mrk.15.28",
    "Mrk.16.9",
    "Mrk.16.10",
    "Mrk.16.11",
    "Mrk.16.12",
    "Mrk.16.13",
    "Mrk.16.14",
    "Mrk.16.15",
    "Mrk.16.16",
    "Mrk.16.18",
    "Mrk.16.19",
    "Mrk.16.20",
    "Luk.17.36",
    "Luk.23.17",
    "Jhn.5.4",
    "Jhn.7.53{8.1}",
    "Jhn.8.1",
    "Jhn.8.2",
    "Jhn.8.3",
    "Jhn.8.4",
    "Jhn.8.5",
    "Jhn.8.6",
    "Jhn.8.7",
    "Jhn.8.8",
    "Jhn.8.9",
    "Jhn.8.10",
    "Jhn.8.11",
    "Act.8.37",
    "Act.15.34",
    "Act.24.7",
    "Act.28.29",
    "Rom.16.25{14.24}",
    "Rom.16.26{14.25}",
    "Rom.16.27{14.26}",
)
