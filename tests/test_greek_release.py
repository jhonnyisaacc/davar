from pathlib import Path

import pytest

from scripts.greek.books import davar_besorah_ids_from_metadata
from scripts.greek.publish import (
    build_and_publish_preview,
    existing_preview_release,
    publish_preview,
    translations_missing_from_preview,
    validate_release_tree,
)
from scripts.greek.release_gate import validate_public_enablement
from scripts.greek.sources import STEPBIBLE_COMMIT
from scripts.greek.stable_json import read_json, write_json


def release_fixture() -> tuple[dict, dict]:
    books = davar_besorah_ids_from_metadata()
    references = []
    payload_books = {}
    for book in books:
        reference = {
            "book": book,
            "chapter": 1,
            "verse": 1,
            "verse_id": "1",
            "index": 1,
            "ref": f"{book}.1.1#1",
            "text": "λόγος",
        }
        references.append(reference)
        payload_books[book] = [
            {
                "chapter": 1,
                "source_ref": f"{book}.1.1",
                "verse": 1,
                "verse_id": "1",
                "words": [
                    {
                        "index": 1,
                        "lemma": "λόγος",
                        "morph": "N-NSM",
                        "ref": reference["ref"],
                        "strong": "G3056",
                        "strong_lookup": "3056",
                        "text": "λόγος",
                        "translit_en": "logos",
                        "translit_es": "logos",
                        "translit_he": "לוגוס",
                        "word_type": "word",
                    }
                ],
            }
        ]
    bundle = {
        "books": payload_books,
        "coverage": {
            "book_count": len(books),
            "expected_book_count": 27,
            "token_count": len(books),
        },
        "lexicon": {
            "G3056": {
                "strong": "G3056",
                "lemma": "λόγος",
                "translit_en": "logos",
                "translit_es": "logos",
                "translit_he": "לוגוס",
            }
        },
        "modifications": "# Modifications\n\nTest fixture.\n",
        "occurrences": {
            "G3056": {
                "count": len(references),
                "namespace": "G",
                "references": references,
            }
        },
        "source": {"reading_edition": "sblgnt"},
    }
    definitions = {
        "entries": {
            "G3056": {
                "senses": [
                    {
                        "definitions": {
                            "en": {
                                "short": "word",
                                "fuller": "a word",
                                "source": "TBESG",
                                "review_status": "approved",
                            }
                        }
                    }
                ]
            }
        },
        "leftovers": [],
        "missing_displayed": [],
    }
    return bundle, definitions


def test_complete_release_is_published_and_revalidated(tmp_path: Path):
    bundle, definitions = release_fixture()
    release_dir = publish_preview(bundle, definitions, tmp_path)
    manifest = validate_release_tree(release_dir)
    assert manifest["revision"] == STEPBIBLE_COMMIT
    assert len(manifest["books"]) == 27
    lexicon = read_json(release_dir / "lexicon.json")
    assert "instances" not in lexicon["G3056"]
    assert lexicon["G3056"]["occurrences_count"] == 27
    assert not (release_dir / "occurrences.json").exists()
    shard = read_json(release_dir / "occurrences" / "G30.json")
    assert shard["G3056"]["count"] == 27
    assert len(shard["G3056"]["references"]) == 27


def test_incomplete_candidate_does_not_replace_active_release(tmp_path: Path):
    bundle, definitions = release_fixture()
    publish_preview(bundle, definitions, tmp_path)
    active_path = tmp_path / "greek" / "manifest.json"
    active_before = active_path.read_bytes()
    bundle["books"].pop(next(iter(bundle["books"])))
    with pytest.raises(ValueError, match="27 Besorah books"):
        publish_preview(bundle, definitions, tmp_path)
    assert active_path.read_bytes() == active_before


def test_corrupt_release_checksum_is_rejected(tmp_path: Path):
    bundle, definitions = release_fixture()
    release_dir = publish_preview(bundle, definitions, tmp_path)
    manifest = read_json(release_dir / "manifest.json")
    book = manifest["books"][0]
    chapter_path = release_dir / "books" / book / "1.json"
    chapter_path.write_text("{}\n", encoding="utf-8")
    with pytest.raises(ValueError):
        validate_release_tree(release_dir)


def test_public_gate_fails_closed_without_reviewed_languages(tmp_path: Path):
    bundle, definitions = release_fixture()
    publish_preview(bundle, definitions, tmp_path)
    approvals = tmp_path / "approvals.json"
    qa_report = tmp_path / "qa.json"
    write_json(
        approvals,
        {
            "revision": STEPBIBLE_COMMIT,
            "languages": {
                "es": {
                    "status": "approved",
                    "reviewer": "reviewer-es",
                    "approved_at": "2026-01-01",
                },
                "he": {
                    "status": "approved",
                    "reviewer": "reviewer-he",
                    "approved_at": "2026-01-01",
                },
            },
        },
    )
    write_json(
        qa_report,
        {
            "revision": STEPBIBLE_COMMIT,
            "cases": [{"id": "preview", "status": "passed"}],
        },
    )
    with pytest.raises(ValueError, match="not publishable"):
        validate_public_enablement(tmp_path, approvals, qa_report)


def test_existing_preview_is_reused_when_revision_is_unchanged(tmp_path, monkeypatch):
    bundle, definitions = release_fixture()
    public = tmp_path / "public"
    published = publish_preview(bundle, definitions, public)

    def boom(*_args, **_kwargs):
        raise AssertionError("should not fetch when the recorded revision is already published")

    monkeypatch.setattr("scripts.greek.publish.fetch_all", boom)
    reused = build_and_publish_preview(
        source_dir=tmp_path / "missing",
        public_data_dir=public,
        allow_fetch=False,
        definitions_dir=tmp_path / "no-defs",
    )
    assert reused == published
    assert existing_preview_release(public) == published


def test_stale_preview_revision_is_not_reused(tmp_path):
    bundle, definitions = release_fixture()
    publish_preview(bundle, definitions, tmp_path)
    manifest_path = tmp_path / "greek" / "manifest.json"
    manifest = read_json(manifest_path)
    manifest["revision"] = "stale"
    write_json(manifest_path, manifest)
    assert existing_preview_release(tmp_path) is None


def test_forced_preview_rebuild_does_not_use_cache(tmp_path, monkeypatch):
    bundle, definitions = release_fixture()
    publish_preview(bundle, definitions, tmp_path)
    called = []

    def fake_fetch(*_args, **_kwargs):
        called.append(True)
        raise FileNotFoundError("no sources")

    monkeypatch.setattr("scripts.greek.publish.fetch_all", fake_fetch)
    with pytest.raises(FileNotFoundError, match="no sources"):
        build_and_publish_preview(
            source_dir=tmp_path / "missing",
            public_data_dir=tmp_path,
            force=True,
            allow_fetch=False,
            definitions_dir=tmp_path / "no-defs",
        )
    assert called


def test_preview_is_not_reused_when_translated_drafts_are_missing(tmp_path):
    bundle, definitions = release_fixture()
    publish_preview(bundle, definitions, tmp_path)
    filled = {
        "entries": {
            "G3056": {
                "senses": [
                    {
                        "definitions": {
                            "en": {
                                "short": "word",
                                "fuller": "a word",
                                "review_status": "approved",
                            },
                            "es": {
                                "short": "palabra",
                                "fuller": "una palabra",
                                "review_status": "draft",
                            },
                            "he": {
                                "short": "דבר",
                                "fuller": "מילה",
                                "review_status": "draft",
                            },
                        }
                    }
                ]
            }
        }
    }
    assert translations_missing_from_preview(tmp_path, filled)
    assert existing_preview_release(tmp_path, store=filled) is None


def test_collapse_runaway_gloss_keeps_unique_head():
    from scripts.greek.publish import collapse_runaway_gloss

    looping = "מביש, חרפה, גנאי, תועבה, תועבה, תועבה, תועבה"
    assert collapse_runaway_gloss(looping) == "מביש, חרפה, גנאי, תועבה"
    assert collapse_runaway_gloss("תהום") == "תהום"
