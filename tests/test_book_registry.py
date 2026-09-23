"""Book names and codes load from data/knowledge/registries/books.json."""

from __future__ import annotations

import json
from pathlib import Path

from scripts.bes.config import BOOK_METADATA, USFX_TO_ENGLISH
from scripts.books import load_books, tth_name_to_code
from scripts.dict.book_mappings import BookMapper
from scripts.dss.config import BOOK_NAMES
from scripts.greek.books import TAGNT_TO_DAVAR, davar_besorah_ids_from_metadata
from scripts.tth.config import BOOKS_INFO
from scripts.ts2009.config import BOOKS_MAPPING

ROOT = Path(__file__).resolve().parents[1]


def test_registry_keeps_fused_song_name_and_source_spellings():
    song = next(book for book in load_books() if book["id"] == "songofsolomon")
    assert song["name"] == "SongOfSolomon"
    assert song["dict"]["en"] == "Song of Solomon"
    assert song["dict"]["tth"] is None
    assert song["tth"]["english_name"] == "Song of Songs"
    assert song["tth"]["book_code"] == "song_of_songs"
    assert song["dss"]["name"] == "Song of Songs"
    assert song["ts2009"]["english"] == "Song of Songs"
    assert USFX_TO_ENGLISH["SNG"] == "SongOfSolomon"
    assert BOOK_NAMES["Canticles"] == "Song of Songs"
    assert BookMapper.BOOK_MAPPING["songofsolomon"]["en"] == "Song of Solomon"
    assert BOOKS_INFO["shir_hashirim"]["english_name"] == "Song of Songs"
    assert BOOKS_MAPPING[22]["name_english"] == "Song of Songs"


def test_callers_keep_source_specific_samuel_and_chapter_counts():
    samuel = BookMapper.get_book_info("isamuel")
    assert samuel["book_id"] == "samuel_1"
    assert samuel["en"] == "1 Samuel"
    assert samuel["es"] == "1 Samuel"
    assert BOOK_METADATA["Samuel1"]["spanish_name"] == "Samuel 1"
    assert BOOK_METADATA["Joel"]["chapters"] == 4
    assert BOOK_METADATA["Malachi"]["chapters"] == 3
    assert BOOKS_MAPPING[29]["expected_chapters"] == 3
    assert BOOKS_MAPPING[39]["expected_chapters"] == 4
    assert BOOKS_MAPPING[9]["name_english"] == "samuel_1"
    assert BOOKS_MAPPING[27]["section"] == "neviim"
    assert BOOK_METADATA["Daniel"]["section"] == "ketuvim"
    assert BookMapper.get_hebrew_translit(samuel) == "Shemuel Alef"
    assert BookMapper.get_hebrew_translit(BookMapper.get_book_info("songofsolomon")) == "Shir"
    assert BookMapper.get_hebrew_translit(BookMapper.get_book_info("genesis")) == "Bereshit"


def test_besorah_ids_and_tth_codes_follow_the_registry():
    assert davar_besorah_ids_from_metadata() == list(TAGNT_TO_DAVAR.values())
    assert len(TAGNT_TO_DAVAR) == 27
    assert TAGNT_TO_DAVAR["Mat"] == "matthew"
    assert TAGNT_TO_DAVAR["1Co"] == "corinthians1"
    mapping = tth_name_to_code()
    assert mapping["SongOfSolomon"] == "shir_hashirim"
    assert mapping["Galatians"] == "galatas"
    assert mapping["Revelation"] == "sodot"
    assert "Obadiah" not in mapping
    assert len(mapping) == len(BOOKS_INFO) == 36


def test_tth_file_names_and_codes_match_the_registry():
    file_books = json.loads((ROOT / "data" / "tth" / "books.json").read_text(encoding="utf-8"))
    assert file_books["BOOKS_INFO"] == BOOKS_INFO
    by_code = {
        book["tth"]["code"]: book for book in load_books() if book.get("tth")
    }
    for code, info in file_books["BOOKS_INFO"].items():
        record = by_code[code]
        assert info["tth_name"] == record["tth"]["tth_name"]
        assert info["hebrew_name"] == record["tth"]["hebrew_name"]
        assert info["english_name"] == record["tth"]["english_name"]
        assert info["spanish_name"] == record["tth"]["spanish_name"]
        assert info["book_code"] == record["tth"]["book_code"]
        assert info["section"] == record["section"]
        assert "patterns" in info
        assert "expected_chapters" in info
