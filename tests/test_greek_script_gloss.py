import re

from scripts.greek.script_gloss import (
    finalize_field,
    has_greek,
    is_script_only,
    localize_protected,
    prepare_field,
    remaining_prose,
)


AARON = """Ἀαρών (Heb. אַהֲרוֹן), indecl. (in FlJ, -ῶνος),
Aaron (Exo.4:14, al.): Luk.1:5, Act.7:40, Heb.5:4, 7:11, 9:4.†
(AS)"""

WEIGHT = """αβαρής, -ές
(βαρός),
without weight; metaphorically (MM, VGT, see word) not burdensome: 2Co.11:9.†
(AS)"""


def test_citations_and_symbols_are_masked():
    prepared = prepare_field(AARON, "es")
    prose = remaining_prose(prepared.api_text)
    assert "Luk.1:5" not in prepared.api_text
    assert "†" not in prepared.api_text
    assert "(AS)" not in prepared.api_text
    assert "Aaron" in prose
    assert not has_greek(prepared.api_text)
    assert not is_script_only(prepared.api_text)


def test_localize_book_abbreviations():
    assert "Hch.7:40" in localize_protected("Act.7:40", "es")
    assert "מע״ש.7:40" in localize_protected("Act.7:40", "he")
    assert "ועוד" in localize_protected("al.", "he")
    assert "etc." in localize_protected("al.", "es")


def test_finalize_keeps_refs_and_maps_them():
    prepared = prepare_field(AARON, "he")
    finished = finalize_field(
        prepared.api_text.replace("Aaron", "אהרן"),
        prepared,
        "he",
    )
    assert "אהרן" in finished
    assert "עב.5:4" in finished
    assert "†" in finished
    assert "(AS)" in finished
    assert "אַהֲרוֹן" in finished
    assert "Ἀαρών" in finished
    assert "-ῶνος" in finished


def test_script_only_when_no_english_prose():
    prepared = prepare_field("Ἀαρών.†\n(AS)", "es")
    assert prepared.script_only
    assert finalize_field("", prepared, "es") == "Ἀαρών.†\n(AS)"


def test_metaphor_line_keeps_english_for_the_model():
    prepared = prepare_field(WEIGHT, "es")
    prose = remaining_prose(prepared.api_text)
    assert "without weight" in prose
    assert "not burdensome" in prose
    assert "metaphorically" not in prose
    assert "2Co.11:9" not in prepared.api_text
    assert not has_greek(prepared.api_text)
    finished = finalize_field(prepared.api_text, prepared, "es")
    assert "αβαρής" in finished
    assert "βαρός" in finished


def test_hebrew_language_label_is_not_hebrews_book():
    finished = finalize_field("", prepare_field("Ἀαρών (Heb. אַהֲרוֹן)", "he"), "he")
    assert "עב׳" in finished
    assert "עב." not in finished


def test_spaced_and_roman_citations_are_masked():
    prepared = prepare_field("to do good: 1 Ti 6:18, xxi.†", "es")
    prose = remaining_prose(prepared.api_text)
    assert "1 Ti 6:18" not in prepared.api_text
    assert "xxi" not in prepared.api_text
    assert "good" in prose


def test_grammatical_boilerplate_is_masked():
    prepared = prepare_field("to love, with accusative of person(s): Mat.5:43.†", "he")
    prose = remaining_prose(prepared.api_text)
    assert "accusative" not in prose
    assert "love" in prose
    finished = finalize_field(prepared.api_text.replace("to love", "לאהוב"), prepared, "he")
    assert "לאהוב" in finished
    assert "ישי׳" in finished
    assert "מתי.5:43" in finished


def test_see_crossref_is_masked_but_gloss_see_is_not():
    pointer = prepare_field("Abaddon (see: ἄβυσσος): Rev.9:11.†", "es")
    assert "see:" not in remaining_prose(pointer.api_text)
    finished = finalize_field(pointer.api_text, pointer, "es")
    assert "véase:" in finished
    assert "ἄβυσσος" in finished

    trailing = prepare_field("to perceive: see", "he")
    assert "perceive" in remaining_prose(trailing.api_text)
    assert re.search(r"(?i)\bsee\b", remaining_prose(trailing.api_text)) is None
    assert "ר׳" in finalize_field(trailing.api_text.replace("to perceive", "להשיג"), trailing, "he")

    gloss = prepare_field("to see clearly, seeing oneself", "es")
    prose = remaining_prose(gloss.api_text)
    assert "to see clearly" in prose
    assert "seeing oneself" in prose


def test_english_phrases_stay_together_for_the_model():
    prepared = prepare_field(
        "to anoint, festally or of homage to human superiors: Mat.6:17.†",
        "es",
    )
    prose = remaining_prose(prepared.api_text)
    assert "of homage to human superiors" in prose
    assert "festally or of homage" in prose


def test_christ_is_mashiach_in_hebrew():
    prepared = prepare_field("to love: to Christ, Christ's love, not Christian", "he")
    prose = remaining_prose(prepared.api_text)
    assert re.search(r"(?i)\bChrist(?:'s)?\b", prose) is None
    assert "Christian" in prose
    finished = finalize_field(prepared.api_text, prepared, "he")
    assert "משיח" in finished
    assert "המשיח" in finished
    assert "Christian" in finished
