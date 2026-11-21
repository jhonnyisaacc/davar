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
    documented = {
        cells[0].strip("` "): set(cells[-1].strip().split(", "))
        for cells in (line.strip("|").split("|") for line in readme.splitlines())
        if cells[0].strip("` ") in CATEGORIES
    }
    statuses = {
        rule["if"]["properties"]["category"]["const"]: set(
            rule["then"]["properties"]["status"].get("enum", [rule["then"]["properties"]["status"].get("const")])
        )
        for rule in schema["$defs"]["evidence"]["allOf"]
    }
    assert documented == statuses
    assert set().union(*statuses.values()) == set(schema["$defs"]["status"]["enum"])


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
    authored_rows = [r for r in value["inventory"] if r["availability"] not in ("available", "gap")]
    for record in value["evidence"] + value["alignments"] + authored_rows:
        assert record["review"] == record["provenance"]["review"]
        assert record["provenance"]["source_id"] in sources
        assert record["version"]["sha256"] == sources[record["provenance"]["source_id"]]["sha256"]
    for item in value["evidence"]:
        assert item["context"]["work"] and item["context"]["locator"] == item["provenance"]["locator"]
    assert {a["status"] for a in value["alignments"] + authored_rows} == {"authored"}
    assert {a["review"] for a in value["alignments"] + authored_rows} == {"unreviewed"}
    authored = read_json(ROOT / alignment.AUTHORED)
    for row in authored_rows:
        pointer = row["provenance"]["locator"]["pointer"]
        assert row["version"]["path"] == alignment.AUTHORED
        assert authored["inventory"][int(pointer.removeprefix("/inventory/"))]["id"] == row["id"]


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
        assert note["context"]["teaching_source_ids"] == ["youtube:VwtpBX1Q444", "youtube:XpT2I9DGotI", "youtube:5yDcBBBWTkY"]
        assert note["context"]["transcript_segment"] is None
        assert note["context"]["locator"]["kind"] == "markdown"
    inventory = by_id(value["inventory"])
    assert inventory["inventory:ts2009"]["role"] == "comparison_reference"
    assert inventory["inventory:lxx"]["category"] == "ANCIENT_TEXTUAL_WITNESS"
    assert inventory["inventory:shaul-transcripts"]["availability"] == "excluded"


def test_inventory_accounts_for_every_source_and_verified_gap(built):
    value, records = built
    inventory = value["inventory"]
    available = {r["id"] for r in inventory if r["availability"] == "available"}
    pinned = {s["id"] for s in records["sources"]}
    assert available | {"inventory:source:custom"} == {"inventory:" + s for s in pinned}
    assert all(r.get("reason") for r in inventory if r["availability"] != "available")
    gaps = {r["subject"] for r in inventory if r["availability"] == "gap"}
    assert gaps == {"D0271", "D0777", "Hb", "Hc", "Hd", "Hk", "Hl"}
    lexicons = [read_json(ROOT / p) for p in ("data/dict/lexicon/words.json", "data/dict/lexicon/roots.json")]
    assert all(not any(code in lexicon for lexicon in lexicons) for code in gaps)
    assert "H2421" in lexicons[1]


def test_inventory_path_claims_are_observed_at_read_time_not_frozen(built, tmp_path):
    value, _ = built
    claimed = sorted(p for r in value["inventory"] for p in r.get("paths", []))
    absent = sorted(p for r in value["inventory"] for p in r.get("absent_paths", []))
    assert claimed and absent
    assert alignment.drift(value, tmp_path) == sorted("missing: " + p for p in claimed)
    (tmp_path / absent[0]).mkdir(parents=True)
    assert "present: " + absent[0] in alignment.drift(value, tmp_path)


def rederived(value, records, collection, record_id, **provenance):
    records = copy.deepcopy(records)
    next(r for r in records[collection] if r["id"] == record_id)["provenance"].update(provenance)
    roles = read_json(ROOT / alignment.AUTHORED)["roles"]
    rebuilt = dict(value, evidence=alignment.evidence(records, roles, value["units"]))
    alignment.validate(rebuilt, records)
    return by_id(rebuilt["evidence"])["aev:" + record_id]


@pytest.mark.parametrize(
    "provenance, status, review",
    [
        ({"transformation": "inferred"}, "inferred", "unreviewed"),
        ({"review": "approved"}, "imported", "approved"),
        ({"review": "rejected"}, "imported", "rejected"),
    ],
)
def test_review_state_is_carried_apart_from_origin_status(built, provenance, status, review):
    value, records = built
    item = rederived(value, records, "evidence", "evidence:bdb-root:H2421", **provenance)
    assert (item["category"], item["role"], item["status"], item["review"]) == (
        "LEXICAL_DATA",
        "lexicon_entry",
        status,
        review,
    )


def test_inferred_status_is_rejected_where_a_category_cannot_hold_it(built):
    value, records = built
    passage = next(e for e in value["evidence"] if e["role"] == "source_language_text")["record"]["id"]
    with pytest.raises(ValidationError):
        rederived(value, records, "passages", passage, transformation="inferred")


@pytest.mark.parametrize(
    "mutate",
    [
        lambda v: next(e for e in v["evidence"] if e["role"] == "study_note").update(category="LEXICAL_DATA"),
        lambda v: v["evidence"][0].update(status="generated"),
        lambda v: v["evidence"][0].update(overrides=["aev:evidence:bdb:H530"]),
        lambda v: v["evidence"][0].update(category="HUMAN_REVIEWED_DECISION", role="review_decision"),
        lambda v: v["alignments"][0].update(shape="one_to_one"),
        lambda v: next(u for u in v["units"] if u["level"] == "token")["surface"].__setitem__(0, "x"),
        lambda v: v["inventory"][0].update(availability="available"),
        lambda v: next(r for r in v["inventory"] if "provenance" in r).pop("version"),
        lambda v: v["evidence"][0].update(review="approved"),
    ],
)
def test_validation_rejects_mislabeled_or_inconsistent_records(built, mutate):
    value, records = built
    broken = copy.deepcopy(value)
    mutate(broken)
    with pytest.raises((ValidationError, ValueError)):
        alignment.validate(broken, records)


def test_validation_rejects_a_role_the_registry_does_not_assign(built):
    value, records = built
    broken = copy.deepcopy(value)
    next(e for e in broken["evidence"] if e["role"] == "baseline_reference_candidate").update(role="comparison_reference")
    with pytest.raises(ValueError, match="role registry"):
        alignment.validate(broken, records)


def test_schema_accepts_a_human_reviewed_decision(built):
    value, _ = built
    decision = dict(
        copy.deepcopy(next(e for e in value["evidence"] if e["role"] == "baseline_reference_candidate")),
        id="aev:decision:example",
        category="HUMAN_REVIEWED_DECISION",
        role="review_decision",
        status="reviewed_decision",
        review="approved",
    )
    decision["context"]["reviewer"] = "example-reviewer"
    decision["provenance"] = dict(decision["provenance"], origin="authored", review="approved")
    validator = alignment.schema_validator(definition="evidence")
    validator.validate(decision)
    assert not validator.is_valid(dict(decision, status="imported"))
    assert not validator.is_valid(dict(decision, category="EXISTING_TRANSLATION", role="baseline_reference_candidate"))


def test_an_unreviewed_human_reviewed_decision_is_rejected(built):
    value, records = built
    decision = dict(
        copy.deepcopy(next(e for e in value["evidence"] if e["role"] == "baseline_reference_candidate")),
        id="aev:decision:unreviewed",
        category="HUMAN_REVIEWED_DECISION",
        role="review_decision",
        status="reviewed_decision",
        review="unreviewed",
    )
    decision["context"]["reviewer"] = "example-reviewer"
    decision["provenance"] = dict(decision["provenance"], origin="authored", review="unreviewed")
    assert not alignment.schema_validator(definition="evidence").is_valid(decision)
    assert alignment.status(decision["provenance"], decision["category"]) != "reviewed_decision"
    broken = copy.deepcopy(value)
    broken["evidence"].append(decision)
    with pytest.raises(ValidationError):
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
