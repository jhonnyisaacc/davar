from pathlib import Path

from scripts.greek.books import TAGNT_SBL_ABSENT_VERSES
from scripts.greek.importer import bundle_bytes, build_bundle, write_bundle
from scripts.greek.parse_tagnt import parse_tagnt_file, spelling_for_sbl
from scripts.greek.parse_tbesg import html_to_text, parse_tbesg_file

FIXTURES = Path(__file__).parent / "fixtures" / "greek"


def load_bundle():
    tagnt = (FIXTURES / "tagnt_import_sample.tsv").read_text(encoding="utf-8")
    tbesg = (FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8")
    return build_bundle([tagnt], tbesg)


def test_sbl_spelling_variant_is_used_when_named():
    text = spelling_for_sbl("ηλι (ēli)", "Tyn: ἠλεὶ ; +Byz+TR+Treg+SBL: Ἠλὶ ;")
    assert text == "Ἠλὶ"


def test_selects_sbl_tokens_and_never_concatenates_matthew_818():
    tokens = parse_tagnt_file(
        (FIXTURES / "tagnt_import_sample.tsv").read_text(encoding="utf-8")
    )
    matt_818 = [token for token in tokens if token.ref.startswith("Mat.8.18")]
    assert [token.text for token in matt_818] == ["πολλοὺς"]
    assert "ὄχλον" not in [token.text for token in tokens]


def test_rebuild_is_byte_stable():
    tagnt = (FIXTURES / "tagnt_import_sample.tsv").read_text(encoding="utf-8")
    tbesg = (FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8")
    first = bundle_bytes(build_bundle([tagnt], tbesg))
    second = bundle_bytes(build_bundle([tagnt], tbesg))
    assert first == second


def test_occurrences_come_from_displayed_sbl_only():
    bundle = load_bundle()
    assert "G3793" not in bundle["occurrences"]
    crowd_alt = bundle["occurrences"]["G4183"]
    assert crowd_alt["namespace"] == "G"
    assert crowd_alt["count"] == 1
    assert crowd_alt["references"][0]["book"] == "matthew"
    assert crowd_alt["references"][0]["text"] == "πολλοὺς"
    assert all(key.startswith("G") for key in bundle["occurrences"])


def test_absent_verses_are_recorded_not_shifted_or_filled():
    bundle = load_bundle()
    matthew_verses = {
        (verse["chapter"], verse["verse_id"]) for verse in bundle["books"]["matthew"]
    }
    assert (17, "21") not in matthew_verses
    assert (1, "1") in matthew_verses
    assert "Mat.17.21" in bundle["coverage"]["absent_verses"]
    assert "Rom.16.25{14.24}" in bundle["coverage"]["absent_verses"]
    assert "Rom.16.25{14.24}" in TAGNT_SBL_ABSENT_VERSES
    romans = bundle["books"]["romans"]
    assert any(verse["verse_id"] == "24" for verse in romans)
    assert not any(verse["verse_id"].startswith("25") for verse in romans)


def test_preserves_accents_final_sigma_and_disambiguated_strongs(tmp_path):
    bundle = load_bundle()
    first = bundle["books"]["matthew"][0]["words"][0]
    assert first["text"] == "Βίβλος"
    assert first["strong"] == "G0976"
    jesus = next(
        word
        for verse in bundle["books"]["matthew"]
        for word in verse["words"]
        if word["strong"] == "G2424G"
    )
    assert jesus["strong_lookup"] == "G2424G"
    write_bundle(bundle, tmp_path)
    source = (tmp_path / "MODIFICATIONS.md").read_text(encoding="utf-8")
    assert "STEP Bible" in source
    assert "ae39711d7843b2902d54993e432de9c12d6a4b9a" in source


def test_tbesg_keeps_short_and_fuller_distinct():
    entries = parse_tbesg_file((FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8"))
    book = next(item for item in entries if item.dstrong == "G0976")
    assert book.short == "book"
    assert "a book, a roll" in book.fuller
    assert book.short != book.fuller
    assert "<b>" not in book.fuller
    assert html_to_text("<b>αἷμα</b>, <BR />blood") == "αἷμα,\nblood"
