"""Executable contract, identity and non-interference guarantees for the pilot."""

import json
import shutil

import pytest
from jsonschema import ValidationError

from scripts.knowledge.build import artifacts, build, output_guard, project
from scripts.knowledge.adapters import greek_passage
from scripts.knowledge.core import (
    KNOWLEDGE,
    OUTPUT,
    ROOT,
    digest,
    encoded,
    lexical_refs,
    make_passage,
    normalize_tag,
    pinned_inputs,
    read_json,
    reference,
)
from scripts.knowledge.validate import Validator, validate_locators, validate_tree


@pytest.fixture(scope="module")
def output():
    return artifacts()


@pytest.fixture
def records(output):
    return json.loads(output["records/records.json"])


def test_all_contracts_and_committed_outputs(output):
    Validator()
    validate_tree(ROOT / OUTPUT)
    committed = {
        p.relative_to(ROOT / OUTPUT).as_posix(): p.read_bytes()
        for p in (ROOT / OUTPUT).rglob("*")
        if p.is_file()
    }
    assert output == committed


@pytest.mark.parametrize(
    "name,value",
    [
        ("reference", {"book_id": "john", "kind": "verse", "chapter": 1, "verse": 1}),
        ("reference", reference("john", 0, 1)),
        ("reference", reference("unknown", 1, 1)),
        (
            "reference",
            {
                "system_id": "davar-v1",
                "book_id": "john",
                "kind": "range",
                "start": {"chapter": 2, "verse": 1},
                "end": {"chapter": 1, "verse": 1},
            },
        ),
    ],
)
def test_invalid_references(name, value):
    with pytest.raises((ValueError, ValidationError)):
        Validator().schema(name, value)


def test_chapters_and_ranges_and_language_neutral_text():
    v = Validator()
    v.schema(
        "reference",
        {"system_id": "davar-v1", "book_id": "john", "kind": "chapter", "chapter": 1},
    )
    for end in ({"chapter": 1, "verse": 51}, {"chapter": 2, "verse": 3}):
        v.schema(
            "reference",
            {
                "system_id": "davar-v1",
                "book_id": "john",
                "kind": "range",
                "start": {"chapter": 1, "verse": 1},
                "end": end,
            },
        )


def test_pilots_have_expected_text_and_positions(output):
    dan = json.loads(output["bundles/daniel/7/13.json"])
    assert any(
        c["edition_id"] == "tth-es" and c["status"] == "absent" for c in dan["coverage"]
    )
    assert not any(p["edition_id"] == "tth-es" for p in dan["records"]["passages"])
    assert [
        (s["start_ordinal"], s["end_ordinal"]) for s in dan["records"]["spans"]
    ] == [(9, 10)]
    john = json.loads(output["bundles/john/1/51.json"])
    greek = next(
        p for p in john["records"]["passages"] if p["edition_id"] == "sblgnt-tagnt"
    )
    tokens = {
        t["ordinal"]: t
        for t in john["records"]["tokens"]
        if t["source_passage_id"] == greek["id"]
    }
    assert tokens[8]["source_index"] == 10
    assert tokens[21]["source_index"] == 23
    assert tokens[24]["source_token_ref"] == "Jhn.1.51#26=NKO"
    assert any(
        e["kind"] == "footnote" and e["content"]["number"] == "23"
        for e in john["records"]["evidence"]
    )
    one = json.loads(output["bundles/john/1/1.json"])
    logos = [
        t
        for t in one["records"]["tokens"]
        if {"namespace": "strong", "code": "G3056"} in t["lexical_refs"]
    ]
    assert {t["ordinal"] for t in logos} == {5, 8, 17}
    assert len({t["id"] for t in logos}) == 3
    assert not one["records"]["relations"]
    assert "<em>era</em>" in next(
        p["text"] for p in one["records"]["passages"] if p["edition_id"] == "tth-es"
    )


@pytest.mark.parametrize(
    "mutation",
    [
        "duplicate",
        "dangling",
        "span_end",
        "snapshot",
        "token",
        "relation",
        "mapping",
        "provenance",
    ],
)
def test_bad_cross_record_graph_fails(records, mutation):
    if mutation == "duplicate":
        records["tokens"].append(records["tokens"][0])
    if mutation == "dangling":
        records["tokens"][0]["source_passage_id"] = "missing"
    if mutation == "span_end":
        records["spans"][0]["end_ordinal"] = 100000000
    if mutation == "snapshot":
        records["spans"][0]["source_passage_id"] = next(
            p["id"]
            for p in records["passages"]
            if p["id"] != records["spans"][0]["source_passage_id"]
        )
    if mutation == "token":
        records["tokens"][0]["text"] += "!"
    if mutation == "relation":
        records["relations"][0]["object"]["id"] = "missing"
    if mutation == "mapping":
        records["passages"][0]["mapping"]["status"] = "unresolved"
    if mutation == "provenance":
        records["tokens"][0]["provenance"]["source_id"] = "missing"
    with pytest.raises((ValueError, ValidationError)):
        Validator().records(records)


def test_identity_policy_and_nonnumeric_label():
    mapping = {"passages": []}

    def make(text="אָב אָב", words=None, label="73[1.74]"):
        return make_passage(
            "oe",
            "daniel",
            7,
            label,
            text,
            words or [{"text": "אָב", "morph": "old"}, {"text": "אָב"}],
            "source:oe",
            "/0",
            mapping,
        )

    original, tokens = make()
    assert original["mapping"] == {"status": "unresolved", "targets": []}
    assert original["native_reference"]["verse_label"] == "73[1.74]"
    assert tokens[0]["id"] != tokens[1]["id"]
    changed, _ = make(
        words=[{"text": "אָב", "morph": "new", "strong": "H1"}, {"text": "אָב"}]
    )
    assert changed["id"] == original["id"]
    for text, words in [
        ("אב אָב", [{"text": "אב"}, {"text": "אָב"}]),
        ("אָב, אָב", [{"text": "אָב,"}, {"text": "אָב"}]),
        ("אָב אָב", [{"text": "אָב אָב"}]),
        ("אח אָב", [{"text": "אח"}, {"text": "אָב"}]),
    ]:
        assert make(text, words)[0]["id"] != original["id"]


def test_real_greek_nonnumeric_source_record():
    path = (
        ROOT
        / "data/greek/preview/greek/releases/sblgnt/ae39711d7843b2902d54993e432de9c12d6a4b9a/books/luke/1.json"
    )
    verse = next(v for v in read_json(path)["verses"] if v["verse_id"] == "73[1.74]")
    passage, tokens = greek_passage(verse, "luke", "/verses/0", {"passages": []})
    Validator().schema("passage", passage)
    assert passage["mapping"] == {"status": "unresolved", "targets": []}
    assert passage["native_reference"]["source_ref"] == "Luk.1.73[1.74]"
    assert tokens[0]["ordinal"] == 1 and tokens[0]["source_index"] == 9
    assert tokens[0]["source_token_ref"] == "Luk.1.73[1.74]#09=NKO"


def test_external_lexical_codes_and_ambiguity():
    assert lexical_refs("Hk/H1247") == [
        {"namespace": "davar-prefix", "code": "Hk"},
        {"namespace": "strong", "code": "H1247"},
    ]
    assert lexical_refs("G3004G")[0] == {"namespace": "tagnt", "code": "G3004G"}
    aliases = read_json(ROOT / KNOWLEDGE / "registries/aliases.json")
    mappings = read_json(ROOT / KNOWLEDGE / "registries/reference-mappings.json")
    assert normalize_tag("#juan_1_51", aliases, mappings)["status"] == "mapped"
    for tag in ("#unknown_1_1", "#malaji_4_5", "#juan_1", "#juan_1_43-51"):
        assert normalize_tag(tag, aliases, mappings)["status"] == "unresolved"
    with pytest.raises(ValueError):
        normalize_tag("#juan_1_51-1", aliases, mappings)


def test_private_evidence_is_excluded_with_dependents(records):
    note = next(e for e in records["evidence"] if e["kind"] == "note")
    source = next(
        s for s in records["sources"] if s["id"] == note["provenance"]["source_id"]
    )
    source["visibility"] = "private"
    note["content"]["secret"] = "PRIVATE_SENTINEL"
    bundle = project(records, reference("john", 1, 51), "0" * 64)
    Validator().bundle(bundle)
    assert "PRIVATE_SENTINEL" not in encoded(bundle).decode()
    assert not any(
        r["id"] == "davar:relation:john-1-51-ben-ha-adam"
        for r in bundle["records"]["relations"]
    )


def test_claim_is_fixture_only(records, output):
    claim = read_json(ROOT / "tests/fixtures/knowledge/claim.json")
    Validator().claim(claim, records)
    for language in ("es", "en", "he", "pt-BR", "fa", "ar"):
        claim["statement"]["language"] = language
        Validator().claim(claim, records)
    assert all(b"fixture:claim:" not in data for data in output.values())
    claim["evidence_ids"] = ["missing"]
    with pytest.raises(ValueError):
        Validator().claim(claim, records)


def test_existing_compound_occurrence():
    custom = read_json(ROOT / "data/dict/lexicon/custom_definitions.json")
    occurrence = next(
        x
        for v in custom.values()
        for x in v.get("oe_instances", [])
        if isinstance(x, dict)
        and x.get("book") == "exodus"
        and x.get("chapter") == 34
        and x.get("verse") == 6
        and x.get("word_positions") == [10, 11]
    )
    assert occurrence["word_positions"] == list(range(10, 12))


def test_build_determinism_source_immutability_and_output_isolation(tmp_path):
    manifest, _ = pinned_inputs(ROOT)
    tracked = [ROOT / i.get("fixture_path", i["path"]) for i in manifest["inputs"]]
    legacy = ROOT / "web/public/data"
    tracked += [p for p in legacy.rglob("*") if p.is_file()]
    before = {p: digest(p.read_bytes()) for p in tracked}
    first, second = tmp_path / "first", tmp_path / "second"
    build(first)
    build(second)

    def tree(p):
        return {
            f.relative_to(p).as_posix(): f.read_bytes()
            for f in p.rglob("*")
            if f.is_file()
        }

    assert tree(first) == tree(second)
    assert before == {p: digest(p.read_bytes()) for p in tracked}
    with pytest.raises(ValueError):
        build(first)
    for invalid in (
        ROOT,
        ROOT / "web/public/data",
        ROOT / "data/oe",
        ROOT / "contracts",
    ):
        with pytest.raises(ValueError):
            output_guard(invalid, ROOT)
    link = tmp_path / "link"
    link.symlink_to(tmp_path / "first", target_is_directory=True)
    with pytest.raises(ValueError):
        output_guard(link, ROOT)


def test_portable_checkout_and_pinned_drift(tmp_path, output):
    clone = tmp_path / "checkout"
    shutil.copytree(ROOT / "contracts", clone / "contracts")
    shutil.copytree(ROOT / "data/knowledge", clone / "data/knowledge")
    manifest, _ = pinned_inputs(ROOT)
    for item in manifest["inputs"]:
        rel = item.get("fixture_path", item["path"])
        target = clone / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / rel, target)
    assert artifacts(clone) == output
    (clone / manifest["inputs"][0]["path"]).write_text("[]")
    with pytest.raises(ValueError, match="Pinned input drift"):
        artifacts(clone)


def test_locator_resolution_rejects_missing_pointer():
    record = {
        "provenance": {
            "source_id": "s",
            "locator": {"kind": "json", "pointer": "/missing"},
        }
    }
    with pytest.raises(KeyError):
        validate_locators({"records": [record]}, {"s": {}})


def test_manifest_integrity(tmp_path):
    build(tmp_path / "out")
    bundle = tmp_path / "out/bundles/john/1/1.json"
    bundle.write_bytes(bundle.read_bytes() + b" ")
    with pytest.raises(ValueError, match="checksum"):
        validate_tree(tmp_path / "out")
