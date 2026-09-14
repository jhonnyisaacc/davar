"""Publish a structurally validated, revision-namespaced Greek preview bundle."""

from __future__ import annotations

import hashlib
import re
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
from scripts.greek.translate import (
    DEFAULT_DEFINITIONS_DIR,
    apply_translation_cache,
    default_cache_path,
    load_cache,
    usable_text,
)
from scripts.greek.transliteration import RULE_VERSION

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DIR = ROOT / "data" / "greek" / "source" / STEPBIBLE_COMMIT
DEFAULT_PUBLIC_DIR = ROOT / "web" / "public" / "data"
DEFAULT_PREVIEW_DIR = ROOT / "data" / "greek" / "preview"
PAGES_FILE_LIMIT_BYTES = 24 * 1024 * 1024
PUBLISHED_SHORT_LIMIT = 120
PUBLISHED_FULLER_LIMIT = 6000
PUBLISHED_DEFINITION_KEYS = ("fuller", "license", "review_status", "short", "source")
_GLOSS_SPLIT = re.compile(r"[,/;|]+")


def collapse_runaway_gloss(text: str | None, *, limit: int = PUBLISHED_SHORT_LIMIT) -> str | None:
    """Keep the unique head of a looping model gloss; drop the rest."""
    if not text:
        return None
    cleaned = " ".join(str(text).split()).strip()
    if not cleaned:
        return None
    seen: list[str] = []
    seen_set: set[str] = set()
    for part in _GLOSS_SPLIT.split(cleaned):
        token = part.strip()
        if not token:
            continue
        if token in seen_set:
            break
        seen.append(token)
        seen_set.add(token)
        if len(", ".join(seen)) > limit:
            seen.pop()
            break
    if seen:
        return ", ".join(seen)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rsplit(" ", 1)[0] or None


def sanitize_published_definitions(definitions: dict) -> dict:
    cleaned: dict = {}
    for language, block in (definitions or {}).items():
        if not isinstance(block, dict):
            cleaned[language] = block
            continue
        item = dict(block)
        short = item.get("short")
        fuller = item.get("fuller")
        if language in {"es", "he"}:
            if isinstance(short, str):
                item["short"] = collapse_runaway_gloss(short)
            if isinstance(fuller, str) and len(fuller) > PUBLISHED_FULLER_LIMIT:
                item["fuller"] = None
            if not item.get("short") and isinstance(fuller, str):
                item["short"] = collapse_runaway_gloss(fuller)
        cleaned[language] = {
            key: item[key]
            for key in PUBLISHED_DEFINITION_KEYS
            if key in item and item[key] not in (None, "")
        }
    return cleaned


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
    return hashlib.sha256(dumps(payload, compact=True).encode("utf-8")).hexdigest()


def write_published_json(path: Path, payload: object) -> None:
    write_json(path, payload, compact=True)


def _published_word(word: dict, position: int) -> dict:
    published = {
        "index": word["index"],
        "lemma": word.get("lemma", ""),
        "morph": word.get("morph"),
        "position": position,
        "ref": word.get("ref"),
        "strong": word["strong"],
        "text": word["text"],
        "word_type": word.get("word_type"),
    }
    for key in (
        "lemma_translit_en",
        "lemma_translit_es",
        "lemma_translit_he",
        "translit_en",
        "translit_es",
        "translit_he",
    ):
        if word.get(key):
            published[key] = word[key]
    lookup = word.get("strong_lookup")
    if lookup and lookup != word["strong"]:
        published["strong_lookup"] = lookup
    if word.get("index") != position:
        published["tagnt_index"] = word["index"]
    return {key: value for key, value in published.items() if value is not None}


def _chapter_payload(book_id: str, chapter: int, verses: list[dict]) -> dict:
    normalized_verses: list[dict] = []
    for verse in verses:
        words = [
            _published_word(word, position)
            for position, word in enumerate(verse["words"], start=1)
        ]
        normalized_verses.append(
            {
                "chapter": verse["chapter"],
                "source_ref": verse.get("source_ref"),
                "text": " ".join(word["text"] for word in words),
                "verse": verse["verse"],
                "verse_id": verse["verse_id"],
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
            "definitions": sanitize_published_definitions(definitions),
            "lemma": lexical.get("lemma", ""),
            "occurrences_count": occurrence.get("count", 0),
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
            write_published_json(staging_dir / "books" / book_id / f"{chapter}.json", payload)
            mobile_book["chapters"][str(chapter)] = payload["verses"]
            chapter_checksums[str(chapter)] = checksum(payload)
        write_published_json(mobile_books_dir / f"{book_id}.json", mobile_book)
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
    write_published_json(staging_dir / "lexicon.json", lexicon)
    assert_public_file_size(staging_dir / "lexicon.json")
    shard_index: dict[str, dict[str, str]] = {}
    for key, payload in occurrence_shards(bundle["occurrences"]).items():
        shard_path = staging_dir / "occurrences" / f"{key}.json"
        write_published_json(shard_path, payload)
        assert_public_file_size(shard_path)
        shard_index[key] = {
            "checksum": checksum(payload),
            "path": f"occurrences/{key}.json",
        }
    write_published_json(staging_dir / "source.json", bundle["source"])
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
    write_published_json(staging_dir / "manifest.json", manifest)
    validate_release_tree(staging_dir, manifest)
    shutil.rmtree(release_dir, ignore_errors=True)
    release_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir.replace(release_dir)
    write_published_json(active_manifest_path, manifest)
    write_published_json(
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
    write_published_json(versions_path, versions)
    sync_committed_preview(public_data_dir)
    return release_dir


def sync_committed_preview(public_data_dir: Path) -> None:
    """Mirror the published runtime tree into the committed preview directory."""
    if public_data_dir.resolve() != DEFAULT_PUBLIC_DIR.resolve():
        return
    greek_src = public_data_dir / "greek"
    if not greek_src.is_dir():
        return
    DEFAULT_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    dest_greek = DEFAULT_PREVIEW_DIR / "greek"
    if dest_greek.exists():
        shutil.rmtree(dest_greek)
    shutil.copytree(greek_src, dest_greek)
    bundle_src = public_data_dir / "bundles" / "greek-sblgnt"
    dest_bundle = DEFAULT_PREVIEW_DIR / "greek-sblgnt"
    if bundle_src.is_dir():
        if dest_bundle.exists():
            shutil.rmtree(dest_bundle)
        shutil.copytree(bundle_src, dest_bundle)
    index_src = public_data_dir / "bundles" / "greek-sblgnt.json"
    if index_src.is_file():
        shutil.copy2(index_src, DEFAULT_PREVIEW_DIR / "greek-sblgnt.json")


def _store_definition_map(store: dict) -> dict[str, dict]:
    mapped: dict[str, dict] = {}
    for strong, entry in store.get("entries", {}).items():
        senses = entry.get("senses") or []
        if not senses:
            continue
        mapped[strong] = senses[0].get("definitions") or {}
    return mapped


def _usable_language_counts(definitions_by_strong: dict) -> dict[str, int]:
    counts = {"es": 0, "he": 0}
    for block in definitions_by_strong.values():
        for language in counts:
            if usable_text(block.get(language)):
                counts[language] += 1
    return counts


def translations_missing_from_preview(
    public_data_dir: Path,
    store: dict | None,
) -> bool:
    """True when the store has Spanish/Hebrew drafts the published lexicon lacks."""
    if not store:
        return False
    lexicon_path = (
        public_data_dir
        / "greek"
        / "releases"
        / "sblgnt"
        / STEPBIBLE_COMMIT
        / "lexicon.json"
    )
    if not lexicon_path.is_file():
        return True
    store_counts = _usable_language_counts(_store_definition_map(store))
    if store_counts["es"] == 0 and store_counts["he"] == 0:
        return False
    lexicon = read_json(lexicon_path)
    published_counts = _usable_language_counts(
        {
            strong: row.get("definitions") or {}
            for strong, row in lexicon.items()
        }
    )
    return any(
        published_counts[language] < store_counts[language]
        for language in ("es", "he")
    )


def _published_payload_is_current(release_dir: Path) -> bool:
    sample = next(release_dir.glob("books/*/*.json"), None)
    if sample is None:
        return False
    raw = sample.read_text(encoding="utf-8")
    if raw.startswith("{\n"):
        return False
    payload = read_json(sample)
    verses = payload.get("verses") or []
    words = (verses[0].get("words") or []) if verses else []
    return not (words and "transliteration" in words[0])


def existing_preview_release(
    public_data_dir: Path,
    store: dict | None = None,
) -> Path | None:
    """Return the published release if it already matches the recorded revision."""
    release_dir = (
        public_data_dir / "greek" / "releases" / "sblgnt" / STEPBIBLE_COMMIT
    )
    active_path = public_data_dir / "greek" / "manifest.json"
    if not release_dir.is_dir() or not active_path.is_file():
        return None
    try:
        active = read_json(active_path)
        if active.get("revision") != STEPBIBLE_COMMIT:
            return None
        if not _published_payload_is_current(release_dir):
            return None
        validate_release_tree(release_dir)
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if translations_missing_from_preview(public_data_dir, store):
        return None
    return release_dir


def build_and_publish_preview(
    source_dir: Path = DEFAULT_SOURCE_DIR,
    public_data_dir: Path = DEFAULT_PUBLIC_DIR,
    force: bool = False,
    allow_fetch: bool = True,
    definitions_dir: Path | None = None,
) -> Path:
    store_path = (definitions_dir or DEFAULT_DEFINITIONS_DIR) / "definitions.json"
    store = read_json(store_path) if store_path.is_file() else None
    if store is not None:
        apply_translation_cache(store, load_cache(default_cache_path()))
    if not force:
        existing = existing_preview_release(public_data_dir, store=store)
        if existing is not None:
            print(
                f"[davar-greek] using existing preview {existing} "
                f"revision={STEPBIBLE_COMMIT}",
                flush=True,
            )
            return existing
    print("[davar-greek] publish-preview start", flush=True)
    sources = fetch_all(
        dest_dir=source_dir,
        include_ubs=True,
        allow_network=allow_fetch,
    )
    tagnt_paths, tbesg_path = default_source_paths(source_dir)
    print("[davar-greek] importing TAGNT/TBESG", flush=True)
    tbesg_text = tbesg_path.read_text(encoding="utf-8")
    bundle = build_bundle(
        [path.read_text(encoding="utf-8") for path in tagnt_paths],
        tbesg_text,
    )
    if store is None:
        print("[davar-greek] mapping TBESG/UBS definitions", flush=True)
        store = build_definitions(
            parse_tbesg_file(tbesg_text),
            set(bundle["occurrences"]),
            parse_ubs_file(sources["ubs-es"].read_text(encoding="utf-8")),
        )
        apply_translation_cache(store, load_cache(default_cache_path()))
    else:
        print("[davar-greek] using translated definition drafts", flush=True)
    print("[davar-greek] writing preview bundle", flush=True)
    output = publish_preview(bundle, store, public_data_dir)
    print(f"[davar-greek] publish-preview ready {output}", flush=True)
    return output
