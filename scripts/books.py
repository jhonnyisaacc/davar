"""Book identity from data/knowledge/registries/books.json.

Callers that need a book name or code read this registry. Pipeline-only
TTH fields stay in data/tth/books.json.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "data" / "knowledge" / "registries" / "books.json"


@lru_cache(maxsize=1)
def load_books() -> tuple[dict, ...]:
    return tuple(json.loads(_PATH.read_text(encoding="utf-8")))


def book_by_tth_code(code: str) -> dict:
    for book in load_books():
        tth = book.get("tth")
        if tth and tth["code"] == code:
            return book
    raise KeyError(f"Unknown TTH book code: {code}")


def usfx_to_english() -> dict[str, str]:
    return {book["usfx"]: book["name"] for book in load_books()}


def book_metadata() -> dict[str, dict]:
    metadata = {}
    for book in load_books():
        metadata[book["name"]] = {
            "section": book["section"],
            "order": book["order"],
            "chapters": book["chapters"],
            "hebrew_name": book["hebrew_name"],
            "hebrew_transliteration": book["hebrew_transliteration"],
            "spanish_name": book["spanish_name"],
        }
    return metadata


def tagnt_to_davar() -> dict[str, str]:
    return {book["tagnt"]: book["id"] for book in load_books() if book.get("tagnt")}


def besorah_ids() -> list[str]:
    return [book["id"] for book in load_books() if book.get("tagnt")]


def canonical_names() -> list[str]:
    return [book["name"] for book in load_books()]


def oe_to_english() -> dict[str, str]:
    return {book["oe"]: book["name"] for book in load_books() if book.get("oe")}


def delitzsch_to_english() -> dict[str, str]:
    return {
        book["id"]: book["name"]
        for book in load_books()
        if book["section"] == "besorah"
    }


def dss_book_names() -> dict[str, str]:
    rows = [book for book in load_books() if book.get("dss")]
    rows.sort(key=lambda book: book["dss"]["index"])
    return {book["dss"]["xml"]: book["dss"]["name"] for book in rows}


def _tanakh_by_ts2009_number() -> list[dict]:
    rows = [book for book in load_books() if book.get("dict")]
    rows.sort(key=lambda book: book["ts2009"]["number"])
    return rows


def dict_book_mapping() -> dict[str, dict]:
    mapping = {}
    for book in _tanakh_by_ts2009_number():
        info = book["dict"]
        mapping[book["oe"]] = {
            "normalized": info["normalized"],
            "book_id": info["book_id"],
            "es": info["es"],
            "en": info["en"],
            "ts2009": info["ts2009"],
            "tth": info["tth"],
        }
    return mapping


def morphhb_map() -> dict[str, str]:
    return {
        book["oe"]: book["dict"]["morphhb"] for book in _tanakh_by_ts2009_number()
    }


def ts2009_mapping() -> dict[int, dict]:
    mapping = {}
    for book in load_books():
        info = book["ts2009"]
        mapping[info["number"]] = {
            "name_anglicized": info["anglicized"],
            "name_hebrew": info["hebrew"],
            "name_english": info["english"],
            "name_spanish": info["spanish"],
            "section": info["section"],
            "expected_chapters": info["expected_chapters"],
        }
    return dict(sorted(mapping.items()))


def tth_name_to_code() -> dict[str, str]:
    return {
        book["name"]: book["tth"]["code"] for book in load_books() if book.get("tth")
    }
