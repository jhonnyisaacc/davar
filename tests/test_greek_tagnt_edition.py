from pathlib import Path

from scripts.greek.books import (
    BESORAH_BOOK_COUNT,
    DAVAR_TO_TAGNT,
    TAGNT_SBL_ABSENT_VERSES,
    TAGNT_TO_DAVAR,
    davar_besorah_ids_from_metadata,
    davar_book_id,
    tagnt_book_code,
)
from scripts.greek.edition import (
    READING_EDITION,
    SBL_EDITION_TOKEN,
    TAGGING_SOURCE,
    edition_tokens,
    includes_sbl,
    parse_word_ref,
    select_sblgnt_tokens,
    verses_without_sbl,
)

FIXTURE = Path(__file__).parent / "fixtures" / "greek" / "tagnt_edition_samples.tsv"


def load_fixture() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in FIXTURE.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        ref, greek, editions, note = line.split("\t")
        rows.append({"ref": ref, "greek": greek, "editions": editions, "note": note})
    return rows


def test_identifies_sblgnt_as_reading_edition_and_stepbible_as_tagging_source():
    assert READING_EDITION == "sblgnt"
    assert TAGGING_SOURCE == "stepbible-tagnt"
    assert SBL_EDITION_TOKEN == "SBL"


def test_maps_all_27_besorah_books_to_tagnt_codes():
    assert len(TAGNT_TO_DAVAR) == BESORAH_BOOK_COUNT
    assert len(DAVAR_TO_TAGNT) == BESORAH_BOOK_COUNT
    assert davar_book_id("Mat") == "matthew"
    assert davar_book_id("1Co") == "corinthians1"
    assert tagnt_book_code("revelation") == "Rev"


def test_tagnt_map_matches_web_and_mobile_besorah_ids():
    published = davar_besorah_ids_from_metadata()
    assert published == list(TAGNT_TO_DAVAR.values())
    assert len(published) == BESORAH_BOOK_COUNT


def test_absent_verse_catalog_keeps_tagnt_identities():
    assert "Mat.17.21" in TAGNT_SBL_ABSENT_VERSES
    assert "Act.8.37" in TAGNT_SBL_ABSENT_VERSES
    assert "Jhn.7.53{8.1}" in TAGNT_SBL_ABSENT_VERSES
    assert "Rom.16.25{14.24}" in TAGNT_SBL_ABSENT_VERSES
    assert "Mat.1.1" not in TAGNT_SBL_ABSENT_VERSES
    assert len(TAGNT_SBL_ABSENT_VERSES) == 41


def test_edition_tokens_ignore_displacement_notes():
    assert edition_tokens("NA28+NA27+Tyn+WH+Treg+TR+Byz«14.24") == frozenset(
        {"NA28", "NA27", "Tyn", "WH", "Treg", "TR", "Byz"}
    )
    assert edition_tokens("Tyn»1+SBL+WH»1+Treg»1+TR+Byz") == frozenset(
        {"Tyn", "SBL", "WH", "Treg", "TR", "Byz"}
    )


def test_nko_word_type_is_not_an_sbl_selector():
    rows = load_fixture()
    nko_without_sbl = next(row for row in rows if row["ref"].startswith("Rom.16.25"))
    assert parse_word_ref(nko_without_sbl["ref"]).word_type == "NKO"
    assert not includes_sbl(nko_without_sbl["editions"])


def test_selects_sbl_tokens_and_does_not_concatenate_alternatives():
    rows = load_fixture()
    selected = select_sblgnt_tokens(rows)
    selected_refs = [row["ref"].split("=")[0] for row in selected]
    assert selected_refs == [
        "Mat.1.1#01",
        "Mat.8.18#05",
        "Mrk.11.31#06",
        "Rom.16.24#01",
    ]
    assert "Mat.8.18#06" not in selected_refs
    assert "Mat.1.25#08" not in selected_refs


def test_matthew_818_keeps_sbl_crowd_word_not_na_alternative():
    rows = [row for row in load_fixture() if row["ref"].startswith("Mat.8.18")]
    selected = select_sblgnt_tokens(rows)
    assert [row["greek"].split()[0] for row in selected] == ["πολλοὺς"]


def test_absent_verses_are_recorded_not_filled():
    rows = load_fixture()
    absent = verses_without_sbl(rows)
    assert "Mat.17.21" in absent
    assert "Act.8.37" in absent
    assert "Mat.1.1" not in absent
    assert "Rom.16.24" not in absent
    for row in rows:
        if row["note"] == "absent_verse":
            assert parse_word_ref(row["ref"]).display_verse in TAGNT_SBL_ABSENT_VERSES


def test_parses_versification_brackets_without_shifting_identity():
    ref = parse_word_ref("Rom.16.25{14.24}#01=NKO")
    assert ref.book == "Rom"
    assert ref.display_verse == "Rom.16.25{14.24}"
    assert ref.index == "01"
