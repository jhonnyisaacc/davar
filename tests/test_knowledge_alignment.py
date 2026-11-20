"""Romans evidence alignment overlay: determinism, roles, alignments, inventory."""

import copy
import json
import subprocess
import sys
import unicodedata

import pytest
from jsonschema import ValidationError

from scripts.knowledge import alignment
from scripts.knowledge.build import artifacts
from scripts.knowledge.core import ROOT, read_json

CATEGORIES = {
    "SOURCE_TEXT",
    "LEXICAL_DATA",
    "EXISTING_TRANSLATION",
    "ANCIENT_TEXTUAL_WITNESS",
    "COMMENTARY_TEACHING",
    "AI_GENERATED_CANDIDATE",
    "HUMAN_REVIEWED_DECISION",
}


@pytest.fixture(scope="module")
def built():
    authored = read_json(ROOT / alignment.AUTHORED)
    records = json.loads(artifacts(ROOT, authored["profile"])["records/records.json"])
    return alignment.load(), records


def by_id(rows):
    return {r["id"]: r for r in rows}


def unit_for(value, edition, verse, surfaces):
    matches = [
        u["id"]
        for u in value["units"]
        if u.get("edition_id") == edition
        and u.get("verse_unit_id", "").endswith(f":romans:1:{verse}")
        and [unicodedata.normalize("NFC", x) for x in u.get("surface", [])] == surfaces
    ]
    assert len(matches) == 1, surfaces
    return matches[0]


def test_committed_fixture_is_a_byte_identical_rebuild():
    first = alignment.fixture()
    assert first == alignment.fixture()
    assert first == (ROOT / alignment.FIXTURE).read_bytes()
    subprocess.run([sys.executable, "-m", "scripts.knowledge.alignment", "check"], cwd=ROOT, check=True)


def test_schema_documents_all_seven_categories():
    schema = read_json(ROOT / alignment.SCHEMA)
    assert set(schema["$defs"]["category"]["enum"]) == CATEGORIES
    conditioned = {
        rule["if"]["properties"]["category"]["const"] for rule in schema["$defs"]["evidence"]["allOf"]
    }
    assert conditioned == CATEGORIES
    assert set(alignment.CATEGORY_STAGE) == CATEGORIES
    readme = (ROOT / alignment.SCHEMA).with_name("README.md").read_text(encoding="utf-8")
    assert all(f"`{c}`" in readme for c in CATEGORIES)


def test_alignments_keep_real_many_to_one_and_one_to_many_shapes(built):
    value, _ = built
    alignments = by_id(value["alignments"])
    expected = {
        "alignment:romans-1-16:kai": ([1, 2], "one_to_many"),
        "alignment:romans-1-17:dikaiosyne": ([1, 1], "one_to_one"),
        "alignment:romans-1-17:ek-pisteos": ([2, 1], "many_to_one"),
        "alignment:romans-1-17:ho-de-dikaios": ([3, 1], "many_to_one"),
        "alignment:romans-1-17:quotation-greek": ([6, 3], "many_to_many"),
    }
    for key, (counts, shape) in expected.items():
        assert (alignments[key]["counts"], alignments[key]["shape"]) == (counts, shape)
    ek = alignments["alignment:romans-1-17:ek-pisteos"]
    assert ek["source"] == [unit_for(value, "sblgnt-tagnt", 17, ["ἐκ", "πίστεως"])]
    units = by_id(value["units"])
    assert units[ek["target"][0]]["level"] == "token"
    assert units[ek["source"][0]]["level"] == "phrase"
    for key in ("verse-tth", "verse-delitzsch"):
        assert alignments["alignment:romans-1-17:" + key]["granularity"] == "verse"
    assert {u["level"] for u in value["units"]} == {"token", "phrase", "verse", "lexical_concept"}


def test_trace_reaches_each_available_category_and_reports_the_lxx_gap(built):
    value, _ = built
    stages = alignment.trace(value, "unit:verse:sblgnt-tagnt:romans:1:17")
    assert list(stages) == [
        "SOURCE_TEXT",
        "LEXICAL_DATA",
        "EXISTING_TRANSLATION",
        "ANCIENT_TEXTUAL_WITNESS",
        "COMMENTARY_TEACHING",
    ]
    assert any(":oe:habakkuk:2:" in e for e in stages["SOURCE_TEXT"])
    assert "aev:evidence:tagnt:G4102G" in stages["LEXICAL_DATA"]
    assert stages["ANCIENT_TEXTUAL_WITNESS"] == ["inventory:lxx"]
    assert "AI_GENERATED_CANDIDATE" not in stages and "HUMAN_REVIEWED_DECISION" not in stages


def test_every_record_carries_source_version_context_and_provenance(built):
    value, _ = built
    sources = by_id(value["sources"])
    for record in value["evidence"] + value["alignments"]:
        assert record["status"] == alignment.status(record["provenance"])
        assert record["provenance"]["source_id"] in sources
        assert record["version"]["sha256"] == sources[record["provenance"]["source_id"]]["sha256"]
    for item in value["evidence"]:
        assert item["context"]["work"] and item["context"]["locator"] == item["provenance"]["locator"]
    assert {a["status"] for a in value["alignments"]} == {"authored"}
    assert {a["provenance"]["review"] for a in value["alignments"]} == {"unreviewed"}


def test_sources_are_labeled_by_their_actual_role(built):
    value, _ = built
    roles = {(e["version"]["path"], e["record"]["collection"], e["category"], e["role"]) for e in value["evidence"]}
    assert ("data/tth/json/romanos.json", "passages", "EXISTING_TRANSLATION", "baseline_reference_candidate") in roles
    assert ("data/tth/json/romanos.json", "evidence", "COMMENTARY_TEACHING", "translator_note") in roles
    assert ("data/delitzsch/parsed/romans/1.json", "passages", "EXISTING_TRANSLATION", "hebrew_translation") in roles
    assert not {e["category"] for e in value["evidence"]} & {
        "ANCIENT_TEXTUAL_WITNESS",
        "AI_GENERATED_CANDIDATE",
        "HUMAN_REVIEWED_DECISION",
    }
    notes = [e for e in value["evidence"] if e["role"] == "study_note"]
    assert len(notes) == 3
    for note in notes:
        assert note["category"] == "COMMENTARY_TEACHING"
        assert note["context"]["teaching_source_ids"] == ["youtube:irpXnhj4cMI"]
        assert note["context"]["transcript_segment"] is None
        assert note["context"]["locator"]["kind"] == "markdown"
    inventory = by_id(value["inventory"])
    assert inventory["inventory:ts2009"]["role"] == "comparison_reference"
    assert inventory["inventory:lxx"]["category"] == "ANCIENT_TEXTUAL_WITNESS"
    assert inventory["inventory:shaul-transcripts"]["status"] == "excluded"


def test_inventory_accounts_for_every_source_and_verified_gap(built):
    value, records = built
    inventory = value["inventory"]
    available = {r["id"] for r in inventory if r["status"] == "available"}
    pinned = {s["id"] for s in records["sources"]}
    assert available | {"inventory:source:custom"} == {"inventory:" + s for s in pinned}
    assert all(r.get("reason") for r in inventory if r["status"] != "available")
    gaps = {r["subject"] for r in inventory if r["status"] == "gap"}
    assert gaps == {"D0271", "D0777", "Hb", "Hc", "Hd", "Hk", "Hl"}
    lexicons = [read_json(ROOT / p) for p in ("data/dict/lexicon/words.json", "data/dict/lexicon/roots.json")]
    assert all(not any(code in lexicon for lexicon in lexicons) for code in gaps)
    assert "H2421" in lexicons[1]
    for row in inventory:
        for path in row.get("absent_paths", []):
            assert not (ROOT / path).exists()


@pytest.mark.parametrize(
    "mutate",
    [
        lambda v: next(e for e in v["evidence"] if e["role"] == "study_note").update(category="LEXICAL_DATA"),
        lambda v: v["evidence"][0].update(status="generated"),
        lambda v: v["evidence"][0].update(overrides=["aev:evidence:bdb:H530"]),
        lambda v: v["evidence"][0].update(category="HUMAN_REVIEWED_DECISION", role="review_decision"),
        lambda v: v["alignments"][0].update(shape="one_to_one"),
        lambda v: next(u for u in v["units"] if u["level"] == "token")["surface"].__setitem__(0, "x"),
        lambda v: v["inventory"][0].update(status="available"),
    ],
)
def test_validation_rejects_mislabeled_or_inconsistent_records(built, mutate):
    value, records = built
    broken = copy.deepcopy(value)
    mutate(broken)
    with pytest.raises((ValidationError, ValueError)):
        alignment.validate(broken, records)


def test_later_stage_records_are_representable_but_outside_this_fixture(built):
    value, records = built
    candidate = dict(
        copy.deepcopy(next(e for e in value["evidence"] if e["role"] == "baseline_reference_candidate")),
        id="aev:candidate:example",
        category="AI_GENERATED_CANDIDATE",
        role="generated_candidate",
        status="generated",
    )
    candidate["context"]["generator"] = "example-model@pinned"
    candidate["provenance"] = dict(candidate["provenance"], transformation="generated")
    broken = copy.deepcopy(value)
    broken["evidence"].append(candidate)
    with pytest.raises(ValueError, match="beyond this fixture's stage"):
        alignment.validate(broken, records)


def test_unit_specs_fail_closed_on_source_text_drift(built):
    _, records = built
    spec = dict(
        key="drift",
        edition_id="sblgnt-tagnt",
        book_id="romans",
        chapter=1,
        verse_label="17",
        ordinals=[7, 8],
        expected_texts=["ἐκ", "πίστει"],
    )
    with pytest.raises(ValueError, match="precondition"):
        alignment.text_units(records, [spec])
