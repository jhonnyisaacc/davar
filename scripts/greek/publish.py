"""Publish a structurally validated, revision-namespaced Greek preview bundle."""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from scripts.greek.books import BESORAH_BOOK_COUNT
from scripts.greek.definitions import build_definitions
from scripts.greek.fetch import fetch_all
from scripts.greek.importer import build_bundle, default_source_paths
from scripts.greek.parse_tbesg import parse_tbesg_file
from scripts.greek.parse_ubs import parse_ubs_file
from scripts.greek.sources import STEPBIBLE_COMMIT
from scripts.greek.stable_json import dumps, read_json, write_json
from scripts.greek.translate import apply_translation_cache, default_cache_path, load_cache
from scripts.greek.transliteration import RULE_VERSION

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DIR = ROOT / "data" / "greek" / "source" / STEPBIBLE_COMMIT
DEFAULT_PUBLIC_DIR = ROOT / "web" / "public" / "data"
PAGES_FILE_LIMIT_BYTES = 24 * 1024 * 1024


def occurrence_shard_key(strong: str) -> str:
    digits = "".join(ch for ch in strong if ch.isdigit()) or "0"
    return f"G{digits.zfill(4)[:2]}"


def assert_public_file_size(path: Path) -> None:
    size = path.stat().st_size
    if size > PAGES_FILE_LIMIT_BYTES:
        raise ValueError(
            f"{path} is {size / (1024 * 1024):.1f} MiB; Cloudflare Pages limit is 25 MiB"
        )


def occurrence_shards(occurrences: dict[str, dict]) -> dict[str, dict[str, dict]]:
    shards: dict[str, dict[str, dict]] = {}
    for strong, bucket in occurrences.items():
        shards.setdefault(occurrence_shard_key(strong), {})[strong] = {
            "count": bucket["count"],
            "namespace": bucket["namespace"],
            "references": [
                {
                    "book": item["book"],
                    "chapter": item["chapter"],
                    "index": item["index"],
                    "verse": item.get("verse"),
                    "verse_id": item.get("verse_id"),
                }
                for item in bucket.get("references", [])
            ],
            "strong": strong,
        }
    return dict(sorted(shards.items()))


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
    for strong in sorted(set(occurrences) | set(store.get("entries", {})) | set(lexicon)):
        definition_entry = store["entries"].get(strong)
        definitions = (
            definition_entry["senses"][0]["definitions"]
            if definition_entry
            else {}
        )
        occurrence = occurrences.get(strong, {})
        lexical = lexicon.get(strong, {"strong": strong})
        published[strong] = {
            "definitions": definitions,
            "lemma": lexical.get("lemma", ""),
            "occurrences_count": occurrence.get("count", 0),
            "source_language": "greek",
            "strong": lexical.get("strong", strong),
            "translit_en": lexical.get("translit_en"),
            "translit_es": lexical.get("translit_es"),
            "translit_he": lexical.get("translit_he"),
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


def validate_release_tree(release_dir: Path, manifest: dict | None = None) -> dict:
    release_manifest = manifest or read_json(release_dir / "manifest.json")
    if release_manifest.get("schema") != "davar-greek-release-v1":
        raise ValueError("Unsupported Greek release manifest")
    if not release_manifest.get("complete") or not release_manifest.get("validated"):
        raise ValueError("Greek release is not marked complete and validated")
    books = release_manifest.get("books", [])
    if len(books) != BESORAH_BOOK_COUNT or len(set(books)) != BESORAH_BOOK_COUNT:
        raise ValueError("Greek release manifest must contain 27 distinct books")
    revision = release_manifest["revision"]
    if release_manifest.get("edition") != "sblgnt":
        raise ValueError("Greek release edition must be sblgnt")
    for book_id in books:
        book_data = release_manifest["book_index"].get(book_id)
        if not book_data or not book_data.get("chapters"):
            raise ValueError(f"Greek release is missing chapter index: {book_id}")
        for chapter in book_data["chapters"]:
            chapter_path = release_dir / "books" / book_id / f"{chapter}.json"
            if not chapter_path.is_file():
                raise ValueError(f"Greek release is missing {book_id} {chapter}")
            payload = read_json(chapter_path)
            if (
                payload.get("book") != book_id
                or payload.get("chapter") != chapter
                or payload.get("revision") != revision
                or payload.get("edition") != "sblgnt"
                or payload.get("source_language") != "greek"
                or not payload.get("complete")
            ):
                raise ValueError(f"Greek chapter identity mismatch: {book_id} {chapter}")
            if checksum(payload) != book_data["checksums"].get(str(chapter)):
                raise ValueError(f"Greek chapter checksum mismatch: {book_id} {chapter}")
            for verse in payload["verses"]:
                for word in verse["words"]:
                    if not word["strong"].startswith("G"):
                        raise ValueError(
                            f"Non-G Strong in {book_id} {chapter}: {word['strong']}"
                        )
    lexicon_path = release_dir / "lexicon.json"
    lexicon = read_json(lexicon_path)
    if checksum(lexicon) != release_manifest["lexicon_checksum"]:
        raise ValueError("Greek lexicon checksum mismatch")
    if any(not strong.startswith("G") for strong in lexicon):
        raise ValueError("Greek lexicon contains a non-G Strong identifier")
    if any(entry.get("instances") for entry in lexicon.values()):
        raise ValueError("Published Greek lexicon must not embed occurrence instances")
    assert_public_file_size(lexicon_path)
    shards = release_manifest.get("occurrence_shards") or {}
    if not shards:
        raise ValueError("Greek release is missing occurrence shards")
    for key, meta in shards.items():
        shard_path = release_dir / meta["path"]
        if not shard_path.is_file():
            raise ValueError(f"Missing occurrence shard: {key}")
        payload = read_json(shard_path)
        if checksum(payload) != meta.get("checksum"):
            raise ValueError(f"Occurrence shard checksum mismatch: {key}")
        assert_public_file_size(shard_path)
        for strong, bucket in payload.items():
            if occurrence_shard_key(strong) != key:
                raise ValueError(f"Strong {strong} is in the wrong shard {key}")
            if (
                not strong.startswith("G")
                or bucket.get("namespace") != "G"
                or bucket.get("count") != len(bucket.get("references", []))
            ):
                raise ValueError(f"Greek occurrence index mismatch: {strong}")
    return release_manifest


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
    staging_dir = (
        public_data_dir / ".greek-staging" / "sblgnt" / STEPBIBLE_COMMIT
    )
    shutil.rmtree(staging_dir, ignore_errors=True)
    staging_dir.mkdir(parents=True, exist_ok=True)

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
            write_json(staging_dir / "books" / book_id / f"{chapter}.json", payload)
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
    write_json(staging_dir / "lexicon.json", lexicon)
    assert_public_file_size(staging_dir / "lexicon.json")
    shard_index: dict[str, dict[str, str]] = {}
    for key, payload in occurrence_shards(bundle["occurrences"]).items():
        shard_path = staging_dir / "occurrences" / f"{key}.json"
        write_json(shard_path, payload)
        assert_public_file_size(shard_path)
        shard_index[key] = {
            "checksum": checksum(payload),
            "path": f"occurrences/{key}.json",
        }
    write_json(staging_dir / "source.json", bundle["source"])
    (staging_dir / "MODIFICATIONS.md").write_text(
        bundle["modifications"],
        encoding="utf-8",
    )

    active_manifest_path = public_data_dir / "greek" / "manifest.json"
    active_manifest = (
        read_json(active_manifest_path) if active_manifest_path.is_file() else {}
    )
    previous_revision = active_manifest.get("revision")
    manifest = {
        "books": sorted(bundle["books"]),
        "book_index": book_index,
        "complete": True,
        "edition": "sblgnt",
        "lexicon_checksum": checksum(lexicon),
        "occurrence_shards": shard_index,
        "publicEnabled": False,
        "revision": STEPBIBLE_COMMIT,
        "schema": "davar-greek-release-v1",
        "taggingRevision": STEPBIBLE_COMMIT,
        "transliterationVersion": RULE_VERSION,
        "validated": True,
        **(
            {"previousRevision": previous_revision}
            if previous_revision and previous_revision != STEPBIBLE_COMMIT
            else {}
        ),
    }
    write_json(staging_dir / "manifest.json", manifest)
    validate_release_tree(staging_dir, manifest)
    shutil.rmtree(release_dir, ignore_errors=True)
    release_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir.replace(release_dir)
    write_json(active_manifest_path, manifest)
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
    print("[davar-greek] publish-preview start", flush=True)
    sources = fetch_all(dest_dir=source_dir, include_ubs=True)
    tagnt_paths, tbesg_path = default_source_paths(source_dir)
    print("[davar-greek] importing TAGNT/TBESG", flush=True)
    tbesg_text = tbesg_path.read_text(encoding="utf-8")
    bundle = build_bundle(
        [path.read_text(encoding="utf-8") for path in tagnt_paths],
        tbesg_text,
    )
    print("[davar-greek] mapping TBESG/UBS definitions", flush=True)
    definitions = build_definitions(
        parse_tbesg_file(tbesg_text),
        set(bundle["occurrences"]),
        parse_ubs_file(sources["ubs-es"].read_text(encoding="utf-8")),
    )
    apply_translation_cache(definitions, load_cache(default_cache_path()))
    print("[davar-greek] writing preview bundle", flush=True)
    output = publish_preview(bundle, definitions, public_data_dir)
    print(f"[davar-greek] publish-preview ready {output}", flush=True)
    return output
