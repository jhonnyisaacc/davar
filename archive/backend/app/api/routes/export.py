"""
Export API routes for offline bundles
"""

from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import ORJSONResponse, StreamingResponse
import json

try:
    import orjson  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - fallback for environments without orjson
    orjson = None

from app.api.deps import require_api_key
from app.config import BUNDLE_VERSIONS
from app.data_loaders import (
    tanaj_loader,
    besorah_loader,
    translation_loader,
    dictionary_loader,
    variant_loader,
    book_mapper
)

router = APIRouter()


def _bundle_headers(dataset: str) -> dict:
    return {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": f'attachment; filename="{dataset}.json"'
    }


def _stream_tanaj_bundle():
    books = tanaj_loader.get_available_books()
    yield b"{\"books\":{"
    first_book = True
    for book in books:
        canonical = book_mapper.to_english(book, source="oe") or book
        key = (canonical or book).lower()
        if not first_book:
            yield b","
        first_book = False
        yield (orjson.dumps(key) if orjson else json.dumps(key).encode("utf-8"))
        yield b":{\"chapters\":{"
        chapters = tanaj_loader.get_chapters(book)
        first_chapter = True
        for chapter in chapters:
            if not first_chapter:
                yield b","
            first_chapter = False
            yield (orjson.dumps(str(chapter)) if orjson else json.dumps(str(chapter)).encode("utf-8"))
            yield b":"
            verses = tanaj_loader.get_verses(book, chapter)
            yield (orjson.dumps(verses) if orjson else json.dumps(verses).encode("utf-8"))
        yield b"}}"
    yield b"}}"


def _stream_besorah_bundle():
    books = besorah_loader.get_available_books()
    yield b"{\"books\":{"
    first_book = True
    for book in books:
        canonical = book_mapper.to_english(book, source="delitzsch") or book
        key = (canonical or book).lower()
        if not first_book:
            yield b","
        first_book = False
        yield (orjson.dumps(key) if orjson else json.dumps(key).encode("utf-8"))
        yield b":{\"chapters\":{"
        chapters = besorah_loader.get_chapters(book)
        first_chapter = True
        for chapter in chapters:
            if not first_chapter:
                yield b","
            first_chapter = False
            yield (orjson.dumps(str(chapter)) if orjson else json.dumps(str(chapter)).encode("utf-8"))
            yield b":"
            verses = besorah_loader.get_verses(book, chapter)
            yield (orjson.dumps(verses) if orjson else json.dumps(verses).encode("utf-8"))
        yield b"}}"
    yield b"}}"


def _load_translation_bundle(path: Path, loader_prefix: str) -> dict:
    bundle: dict = {}
    for file_path in sorted(path.glob("*.json")):
        key = file_path.stem
        bundle[key] = translation_loader.load_json(
            f"{loader_prefix}/{file_path.name}")
    return {"books": bundle}


def _load_dictionary_bundle() -> dict:
    prefixes = {}
    for prefix_id in dictionary_loader.get_available_prefixes():
        entry = dictionary_loader.get_prefix(prefix_id)
        if entry:
            prefixes[prefix_id] = entry

    return {
        "custom_definitions": dictionary_loader.load_custom_definitions(),
        "roots": dictionary_loader.load_roots_lexicon(),
        "prefixes": prefixes
    }


@router.get("/export/versions")
async def export_versions(api_key: str = Depends(require_api_key)):
    """Return current version numbers for all downloadable bundles."""
    return ORJSONResponse(content=BUNDLE_VERSIONS)


@router.get("/export/bundle/{dataset}")
async def export_bundle(dataset: str, api_key: str = Depends(require_api_key)):
    """Download minified JSON bundle for offline use."""
    dataset_key = dataset.lower().strip()

    if dataset_key == "tanaj":
        return StreamingResponse(
            _stream_tanaj_bundle(),
            media_type="application/json",
            headers=_bundle_headers(dataset_key)
        )

    if dataset_key == "besorah":
        return StreamingResponse(
            _stream_besorah_bundle(),
            media_type="application/json",
            headers=_bundle_headers(dataset_key)
        )

    if dataset_key == "dss":
        data = variant_loader.load_dss_data()
        return ORJSONResponse(content=data, headers=_bundle_headers(dataset_key))

    if dataset_key == "dictionary":
        data = _load_dictionary_bundle()
        return ORJSONResponse(content=data, headers=_bundle_headers(dataset_key))

    if dataset_key == "tth":
        data = _load_translation_bundle(
            translation_loader.tth_path, "tth/json")
        return ORJSONResponse(content=data, headers=_bundle_headers(dataset_key))

    if dataset_key == "ts2009":
        data = _load_translation_bundle(
            translation_loader.ts2009_path, "ts2009")
        return ORJSONResponse(content=data, headers=_bundle_headers(dataset_key))

    if dataset_key == "bes":
        data = _load_translation_bundle(
            translation_loader.bes_path, "bes/json")
        return ORJSONResponse(content=data, headers=_bundle_headers(dataset_key))

    raise HTTPException(status_code=404, detail=f"Unknown dataset '{dataset}'")
