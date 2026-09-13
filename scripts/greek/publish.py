"""Publish a structurally validated, revision-namespaced Greek preview bundle."""

from __future__ import annotations

import hashlib
from pathlib import Path

from scripts.greek.books import BESORAH_BOOK_COUNT
from scripts.greek.definitions import build_definitions
from scripts.greek.fetch import fetch_all
from scripts.greek.importer import build_bundle, default_source_paths
from scripts.greek.parse_tbesg import parse_tbesg_file
from scripts.greek.parse_ubs import parse_ubs_file
from scripts.greek.sources import STEPBIBLE_COMMIT
from scripts.greek.stable_json import dumps, read_json, write_json
from scripts.greek.transliteration import RULE_VERSION

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DIR = ROOT / "data" / "greek" / "source" / STEPBIBLE_COMMIT
DEFAULT_PUBLIC_DIR = ROOT / "web" / "public" / "data"


def checksum(payload: object) -> str:
    return hashlib.sha256(dumps(payload).encode("utf-8")).hexdigest()


def _chapter_payload(book_id: str, chapter: int, verses: list[dict]) -> dict:
    normalized_verses: list[dict] = []
    for verse in verses:
        words = []
        for position, word in enumerate(verse["words"], start=1):
            words.append(
                {
                    **word,
                    "position": position,
                    "tagnt_index": word["index"],
                }
            )
        normalized_verses.append(
            {
                **verse,
                "source_language": "greek",
                "edition": "sblgnt",
                "revision": STEPBIBLE_COMMIT,
                "text": " ".join(word["text"] for word in words),
                "words": words,
            }
        )
    return {
        "book": book_id,
        "chapter": chapter,
        "complete": bool(normalized_verses),
        "edition": "sblgnt",
        "revision": STEPBIBLE_COMMIT,
        "source_language": "greek",
        "verses": normalized_verses,
    }


def _definition_payload(store: dict, lexicon: dict, occurrences: dict) -> dict:
    published: dict[str, dict] = {}
    for strong, lexical in lexicon.items():
        definition_entry = store["entries"].get(strong)
        definitions = (
            definition_entry["senses"][0]["definitions"]
            if definition_entry
            else {}
        )
        occurrence = occurrences.get(strong, {})
        published[strong] = {
            **lexical,
            "definitions": definitions,
            "occurrences_count": occurrence.get("count", 0),
            "instances": occurrence.get("references", []),
            "source_language": "greek",
        }
    return published


def validate_preview_bundle(bundle: dict, definitions: dict) -> None:
    if len(bundle["books"]) != BESORAH_BOOK_COUNT:
        raise ValueError("Greek preview must contain all 27 Besorah books")
    if bundle["coverage"]["token_count"] <= 0:
        raise ValueError("Greek preview has no displayed SBL tokens")
    if definitions.get("missing_displayed"):
        raise ValueError(
            "Missing TBESG entries for displayed Strong identifiers: "
            + ", ".join(definitions["missing_displayed"][:10])
        )
    for strong, occurrence in bundle["occurrences"].items():
        if not strong.startswith("G") or occurrence["namespace"] != "G":
            raise ValueError(f"Greek release contains non-G Strong identifier: {strong}")
        if occurrence["count"] != len(occurrence["references"]):
            raise ValueError(f"Greek occurrence index mismatch: {strong}")


def publish_preview(
    bundle: dict,
    definitions: dict,
    public_data_dir: Path = DEFAULT_PUBLIC_DIR,
) -> Path:
    validate_preview_bundle(bundle, definitions)
    release_dir = (
        public_data_dir
        / "greek"
        / "releases"
        / "sblgnt"
        / STEPBIBLE_COMMIT
    )
    release_dir.mkdir(parents=True, exist_ok=True)

    book_index: dict[str, dict] = {}
    mobile_books_dir = (
        public_data_dir / "bundles" / "greek-sblgnt" / STEPBIBLE_COMMIT
    )
    for book_id, verses in bundle["books"].items():
        chapters: dict[int, list[dict]] = {}
        for verse in verses:
            chapters.setdefault(verse["chapter"], []).append(verse)
        mobile_book = {
            "book": book_id,
            "edition": "sblgnt",
            "revision": STEPBIBLE_COMMIT,
            "source_language": "greek",
            "chapters": {},
        }
        chapter_checksums: dict[str, str] = {}
        for chapter, chapter_verses in sorted(chapters.items()):
            payload = _chapter_payload(book_id, chapter, chapter_verses)
            write_json(release_dir / "books" / book_id / f"{chapter}.json", payload)
            mobile_book["chapters"][str(chapter)] = payload["verses"]
            chapter_checksums[str(chapter)] = checksum(payload)
        write_json(mobile_books_dir / f"{book_id}.json", mobile_book)
        book_index[book_id] = {
            "chapters": sorted(chapters),
            "checksums": chapter_checksums,
            "mobile_checksum": checksum(mobile_book),
        }

    lexicon = _definition_payload(
        definitions,
        bundle["lexicon"],
        bundle["occurrences"],
    )
    write_json(release_dir / "lexicon.json", lexicon)
    write_json(release_dir / "occurrences.json", bundle["occurrences"])
    write_json(release_dir / "source.json", bundle["source"])
    (release_dir / "MODIFICATIONS.md").write_text(
        bundle["modifications"],
        encoding="utf-8",
    )

    manifest = {
        "books": sorted(bundle["books"]),
        "book_index": book_index,
        "complete": True,
        "edition": "sblgnt",
        "lexicon_checksum": checksum(lexicon),
        "publicEnabled": False,
        "revision": STEPBIBLE_COMMIT,
        "schema": "davar-greek-release-v1",
        "taggingRevision": STEPBIBLE_COMMIT,
        "transliterationVersion": RULE_VERSION,
        "validated": True,
    }
    write_json(release_dir / "manifest.json", manifest)
    write_json(public_data_dir / "greek" / "manifest.json", manifest)
    write_json(
        public_data_dir / "bundles" / "greek-sblgnt.json",
        {
            "books": sorted(bundle["books"]),
            "edition": "sblgnt",
            "parts": {
                book_id: {
                    "checksum": data["mobile_checksum"],
                    "path": (
                        f"greek-sblgnt/{STEPBIBLE_COMMIT}/{book_id}.json"
                    ),
                }
                for book_id, data in book_index.items()
            },
            "revision": STEPBIBLE_COMMIT,
            "schema": "davar-greek-split-bundle-v1",
        },
    )
    versions_path = public_data_dir / "bundles" / "versions.json"
    versions = read_json(versions_path) if versions_path.is_file() else {}
    versions[f"greek:sblgnt:{STEPBIBLE_COMMIT}"] = 1
    write_json(versions_path, versions)
    return release_dir


def build_and_publish_preview(
    source_dir: Path = DEFAULT_SOURCE_DIR,
    public_data_dir: Path = DEFAULT_PUBLIC_DIR,
) -> Path:
    sources = fetch_all(dest_dir=source_dir, include_ubs=True)
    tagnt_paths, tbesg_path = default_source_paths(source_dir)
    tbesg_text = tbesg_path.read_text(encoding="utf-8")
    bundle = build_bundle(
        [path.read_text(encoding="utf-8") for path in tagnt_paths],
        tbesg_text,
    )
    definitions = build_definitions(
        parse_tbesg_file(tbesg_text),
        set(bundle["occurrences"]),
        parse_ubs_file(sources["ubs-es"].read_text(encoding="utf-8")),
    )
    return publish_preview(bundle, definitions, public_data_dir)
