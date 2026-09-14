from pathlib import Path

from scripts.greek.definitions import build_definitions, coverage_report
from scripts.greek.importer import build_bundle
from scripts.greek.parse_tbesg import parse_tbesg_file
from scripts.greek.parse_ubs import parse_ubs_file

FIXTURES = Path(__file__).parent / "fixtures" / "greek"


def load_store():
    bundle = build_bundle(
        [(FIXTURES / "tagnt_import_sample.tsv").read_text(encoding="utf-8")],
        (FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8"),
    )
    entries = parse_tbesg_file((FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8"))
    ubs = parse_ubs_file((FIXTURES / "ubs_es_sample.json").read_text(encoding="utf-8"))
    displayed = set(bundle["occurrences"]) | {"G0002", "G0129G", "G0129H", "G1383G", "G1383H"}
    return build_definitions(entries, displayed, ubs)


def test_english_short_and_fuller_stay_distinct():
    store = load_store()
    english = store["entries"]["G0976"]["senses"][0]["definitions"]["en"]
    assert english["short"] == "book"
    assert "a book, a roll" in english["fuller"]
    assert english["short"] != english["fuller"]
    assert english["review_status"] == "approved"
    assert store["entries"]["G0976"]["occurrence_translation"] is None


def test_ubs_maps_only_with_lemma_and_sense_evidence():
    store = load_store()
    book_es = store["entries"]["G0976"]["senses"][0]["definitions"]["es"]
    assert book_es["review_status"] == "imported"
    assert book_es["license"] == "CC-BY-SA-4.0"
    assert book_es["evidence"]["kind"] == "unique_lemma_sense"
    assert book_es["short"] == "libro"
    assert book_es["ubs_lemma"] == "βίβλος"

    test_es = store["entries"]["G1383G"]["senses"][0]["definitions"]["es"]
    assert test_es["evidence"]["kind"] == "shared_content_words"
    assert test_es["ubs_lex_id"] == "dokime-1"

    leftover_ids = {item["dstrong"] for item in store["leftovers"]}
    assert "G1383H" in leftover_ids
    assert "G0129G" in leftover_ids
    assert "G0129H" in leftover_ids
    assert store["entries"]["G1383H"]["senses"][0]["definitions"]["es"]["review_status"] == "draft"
    reasons = {item["dstrong"]: item["reason"] for item in store["leftovers"]}
    assert reasons["G0129G"] == "lemma_without_sense_evidence"


def test_strongs_alone_does_not_map_a_different_lemma():
    store = load_store()
    book_es = store["entries"]["G0976"]["senses"][0]["definitions"]["es"]
    assert book_es["ubs_lex_id"] != "false-1"
    assert book_es["ubs_lemma"] != "ψευδής"


def test_hebrew_and_unmapped_spanish_are_drafts():
    store = load_store()
    for entry in store["entries"].values():
        hebrew = entry["senses"][0]["definitions"]["he"]
        assert hebrew["review_status"] == "draft"
        assert hebrew["short"] is None
        assert hebrew["source"] == "english-baseline"
    report = coverage_report(store)
    assert report["languages"]["en"]["missing"] == 0
    assert report["languages"]["en"]["approved"] >= report["entry_count"]
    assert report["languages"]["he"]["draft"] >= report["entry_count"]
    assert report["languages"]["es"]["imported"] >= 2
    assert report["languages"]["es"]["draft"] >= 1
    assert report["languages"]["en"]["missing"] == 0
    assert store["missing_displayed"] == []
    assert "G3793" not in store["entries"]


def test_tagnt_stems_alias_to_tbesg_family_entries():
    store = load_store()
    assert store["entries"]["G0256"]["tbesg_dstrongs"] == ["G0256G", "G0256H"]
    assert store["entries"]["G2453"]["tbesg_dstrongs"] == ["G2453G"]
    assert store["entries"]["G3700G"]["tbesg_dstrongs"] == ["G3700"]
    assert store["entries"]["G3700H"]["tbesg_dstrongs"] == ["G3700"]
    assert store["entries"]["G3708"]["tbesg_dstrongs"] == ["G3708G", "G3708H"]
    assert store["entries"]["G0256"]["senses"][0]["definitions"]["en"]["short"] == "Alphaeus"
    assert store["entries"]["G3708"]["senses"][0]["definitions"]["en"]["short"] == "to see: see"
