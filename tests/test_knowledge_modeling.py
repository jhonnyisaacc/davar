"""Source-language and concept-ownership regressions for the portable contract."""

import copy
import json

import pytest
from jsonschema import ValidationError

from scripts.knowledge.adapters import oe_passage
from scripts.knowledge.build import artifacts
from scripts.knowledge.core import ROOT, read_json
from scripts.knowledge.validate import Validator


@pytest.fixture
def records():
    return json.loads(artifacts()["records/records.json"])


def test_pilot_languages_are_explicit_without_duplicate_token_metadata(records):
    languages = {"oe": "arc", "delitzsch": "he", "sblgnt-tagnt": "grc", "tth-es": "es"}
    for passage in records["passages"]:
        assert passage["language"] == languages[passage["edition_id"]]
    assert next(e for e in records["editions"] if e["id"] == "oe")["language"] == "mul"
    assert all("language" not in token for token in records["tokens"])
    assert all(concept["owner"] == "shaul" for concept in records["concepts"])


@pytest.mark.parametrize(
    "book,chapter,verse,language",
    [("genesis", 1, 1, "he"), ("daniel", 7, 13, "arc"), ("daniel", 2, 4, "mul")],
)
def test_real_oe_language_markers(book, chapter, verse, language):
    original = next(
        v
        for v in read_json(ROOT / f"data/oe/{book}/{chapter}.json")
        if v["verse"] == verse
    )
    before = copy.deepcopy(original)
    passage, tokens = oe_passage(original, book, "/fixture", {"passages": []})
    Validator().schema("passage", passage)
    for token in tokens:
        Validator().schema("token", token)
    assert passage["edition_id"] == "oe"
    assert passage["language"] == language
    if language == "mul":
        assert [t["language"] for t in tokens] == ["he"] * 4 + ["arc"] * 9
    else:
        assert all("language" not in t for t in tokens)
    assert original == before


def test_unknown_oe_language_is_not_guessed():
    verse = {"words": [{"text": "x", "morph": "unknown"}]}
    with pytest.raises(ValueError, match="language marker"):
        oe_passage(verse, "daniel", "/fixture", {"passages": []})


@pytest.mark.parametrize("mutation", ["missing", "invalid", "mixed", "token_mul"])
def test_invalid_languages_fail(records, mutation):
    passage = records["passages"][0]
    if mutation == "missing":
        del passage["language"]
    elif mutation == "invalid":
        passage["language"] = "not a language"
    elif mutation == "mixed":
        passage["language"] = "mul"
    else:
        records["tokens"][0]["language"] = "mul"
    with pytest.raises((ValueError, ValidationError)):
        Validator().records(records)


def test_language_metadata_does_not_change_identity(records):
    passage = next(p for p in records["passages"] if p["edition_id"] == "oe")
    passage["language"] = "he"
    Validator().records(records)
    passage["language"] = "mul"
    for token in records["tokens"]:
        if token["source_passage_id"] == passage["id"]:
            token["language"] = "arc"
    Validator().records(records)


@pytest.mark.parametrize("kind", ["concept", "expression"])
def test_davar_owned_fixture_does_not_require_invented_upstream_record(records, kind):
    fixture = copy.deepcopy(records["concepts"][0])
    fixture.update(id=f"davar:{kind}:test-fixture", kind=kind, owner="davar")
    fixture.pop("upstream_id")
    fixture.pop("source_record")
    source = copy.deepcopy(
        next(
            s
            for s in records["sources"]
            if s["id"] == fixture["provenance"]["source_id"]
        )
    )
    source.update(id="source:davar-test-fixture", owner="davar")
    fixture["provenance"]["source_id"] = source["id"]
    records["sources"].append(source)
    records["concepts"].append(fixture)
    Validator().records(records)


@pytest.mark.parametrize(
    "mutation", ["upstream_id", "source_record", "owner", "id", "kind", "source_owner"]
)
def test_concept_ownership_constraints_remain_strict(records, mutation):
    concept = records["concepts"][0]
    if mutation in ("upstream_id", "source_record"):
        del concept[mutation]
    elif mutation == "owner":
        concept["owner"] = "other"
    elif mutation == "id":
        concept["owner"] = "davar"
    elif mutation == "kind":
        concept["kind"] = "expression" if concept["kind"] == "concept" else "concept"
    else:
        source = next(
            s
            for s in records["sources"]
            if s["id"] == concept["provenance"]["source_id"]
        )
        source["owner"] = "davar"
    with pytest.raises((ValueError, ValidationError)):
        Validator().records(records)
