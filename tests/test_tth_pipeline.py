"""Fixture pairs for the pure TTH Markdown-to-JSON core.

Each pair is one book shape the converter has to keep stable:

- amos: standard multi-chapter book
- tehilim: Psalms, including book-division labels
- ionah: a single chapter
- galatas: Besorah
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from scripts.tth.config import BOOKS_INFO, DOCX_BOOKS
from scripts.tth.docx_to_md import convert_docx
from scripts.tth.json_postprocess import postprocess_book
from scripts.tth.main import infer_books_for_docx
from scripts.tth.md_to_json import convert_book_markdown_to_json

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "tth"
CONFIG_PATH = REPO_ROOT / "scripts" / "tth" / "config.py"
BOOKS_PATH = REPO_ROOT / "data" / "tth" / "books.json"
COMMITTED_AMOS = REPO_ROOT / "data" / "tth" / "json" / "amos.json"

STRATEGIES = (
    ("amos", "standard"),
    ("tehilim", "psalms"),
    ("ionah", "single-chapter"),
    ("galatas", "besorah"),
)

# Live convert/postprocess differs from committed amos.json on these verses.
AMOS_VERSES_CURRENT_CONVERT_NOT_COMMITTED = {(2, 12), (4, 13), (5, 27), (7, 9), (7, 17), (8, 14), (9, 10)}


def _canonical(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _convert_fixture(book: str) -> dict:
    markdown = (FIXTURES / f"{book}.md").read_text(encoding="utf-8")
    return convert_book_markdown_to_json(book, markdown)


def test_books_json_loads_and_config_has_no_book_literal():
    loaded = json.loads(BOOKS_PATH.read_text(encoding="utf-8"))
    assert loaded["BOOKS_INFO"] == BOOKS_INFO
    assert loaded["DOCX_BOOKS"] == DOCX_BOOKS
    source = CONFIG_PATH.read_text(encoding="utf-8")
    assert "BOOKS_INFO = {" not in source
    assert "book_by_tth_code" in source
    assert 'BOOKS_INFO = _books_info(_BOOKS["BOOKS_INFO"])' in source
    assert 'DOCX_BOOKS = _BOOKS["DOCX_BOOKS"]' in source


def test_docx_books_map_matches_infer_books_for_docx():
    assert infer_books_for_docx(Path("apocalipsis.docx")) == ["sodot"]
    assert infer_books_for_docx(Path("romanos.docx")) == ["romanos"]
    assert infer_books_for_docx(Path("galatas.docx")) == ["galatas"]
    assert infer_books_for_docx(Path("besorah.docx")) == [
        "matityahu",
        "markos",
        "lukas",
        "iojanan",
        "maasei_hashlijim",
    ]
    tanaj = infer_books_for_docx(Path("tanaj.docx"))
    assert tanaj == [
        key
        for key, info in BOOKS_INFO.items()
        if info.get("section") in {"torah", "neviim", "ketuvim"}
    ]
    assert "galatas" not in tanaj
    assert infer_books_for_docx(Path("unknown.docx")) == list(BOOKS_INFO)


def test_fixture_strategies_match_pipeline_bytes():
    for book, strategy in STRATEGIES:
        markdown = (FIXTURES / f"{book}.md").read_text(encoding="utf-8")
        expected_path = FIXTURES / f"{book}.json"
        converted = convert_book_markdown_to_json(book, markdown)
        processed = postprocess_book(converted, book)
        assert _canonical(processed) == expected_path.read_text(encoding="utf-8"), strategy

        data = json.loads(expected_path.read_text(encoding="utf-8"))
        if strategy == "standard":
            assert data["book_info"]["total_chapters"] == 9
            assert data["book_info"]["book_id"] == "amos"
        elif strategy == "psalms":
            divisions = {chapter["chapter"]: chapter.get("book_division") for chapter in data["chapters"]}
            assert divisions[1] == "LIBRO PRIMERO"
            assert divisions[42] == "LIBRO SEGUNDO"
        elif strategy == "single-chapter":
            assert data["book_info"]["total_chapters"] == 1
            assert [chapter["chapter"] for chapter in data["chapters"]] == [1]
        elif strategy == "besorah":
            assert data["book_info"]["section"] == "besorah"
            assert data["book_info"]["total_chapters"] == 6


def test_convert_and_postprocess_accept_text_or_dicts():
    markdown = (FIXTURES / "ionah.md").read_text(encoding="utf-8")
    from_text = convert_book_markdown_to_json("ionah", markdown)
    from_dict = convert_book_markdown_to_json("ionah", {"markdown": markdown})
    assert from_dict == from_text
    assert convert_book_markdown_to_json("ionah", {"text": markdown}) == from_text
    assert convert_book_markdown_to_json("ionah", from_text) == from_text

    original = json.loads(json.dumps(from_text))
    snapshot = json.loads(json.dumps(from_text))
    from_json_text = postprocess_book(json.dumps(original), "ionah")
    from_mapping = postprocess_book(original, "ionah")
    assert original == snapshot
    assert from_json_text == from_mapping
    assert _canonical(from_mapping) == (FIXTURES / "ionah.json").read_text(encoding="utf-8")


def test_amos_fixture_keeps_seven_verse_differences_from_committed_json():
    generated = json.loads((FIXTURES / "amos.json").read_text(encoding="utf-8"))
    committed = json.loads(COMMITTED_AMOS.read_text(encoding="utf-8"))
    assert generated["book_info"] == committed["book_info"]

    differing = set()
    for chapter, committed_chapter in zip(generated["chapters"], committed["chapters"], strict=True):
        assert chapter["chapter"] == committed_chapter["chapter"]
        for verse, committed_verse in zip(chapter["verses"], committed_chapter["verses"], strict=True):
            if verse != committed_verse:
                differing.add((chapter["chapter"], verse["verse"]))
            else:
                assert (chapter["chapter"], verse["verse"]) not in AMOS_VERSES_CURRENT_CONVERT_NOT_COMMITTED
    assert differing == AMOS_VERSES_CURRENT_CONVERT_NOT_COMMITTED

SHIR_DOCX = REPO_ROOT / "data" / "tth" / "raw" / "shir_hashirim.docx"
SHIR_MARKDOWN = REPO_ROOT / "data" / "tth" / "markdown" / "shir_hashirim.md"


@pytest.mark.skipif(
    importlib.util.find_spec("mammoth") is None,
    reason="mammoth is not installed",
)
def test_shir_hashirim_docx_converts_to_committed_markdown(tmp_path):
    out = tmp_path / "shir_hashirim.md"
    convert_docx(str(SHIR_DOCX), str(out), verbose=False)
    assert out.read_bytes() == SHIR_MARKDOWN.read_bytes()
    markdown = out.read_text(encoding="utf-8")
    assert markdown.startswith("__SHIR HASHIRIM \\(CANTARES\\)__שיר השירים")
    assert "La canción de las canciones, la cual es de Shelomóh." in markdown

