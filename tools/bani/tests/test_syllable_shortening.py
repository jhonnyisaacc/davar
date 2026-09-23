"""Regression tests for conservative Hebrew syllable shortening."""


from pathlib import Path

from tools.bani.apply import Transliterator, load_jsonc

_SCHEMAS = Path(__file__).parents[1] / "schemas"


def _engine(language: str) -> Transliterator:
    return Transliterator(load_jsonc(_SCHEMAS / f"{language}.json"))


def test_medial_sheva_is_silent_in_miqveh():
    result = _engine("en").transliterate_word("מִקְוֶה", "H4723")

    assert result["translit"] == "miqveh"


def test_vocal_sheva_at_word_start_is_preserved():
    result = _engine("en").transliterate_word("וְ", "H6")

    assert result["translit"] == "ve"


def test_existing_simple_word_remains_unchanged():
    result = _engine("en").transliterate_word("יוֹם", "H3117")

    assert result["translit"] == "yom"


def test_qof_uses_q_in_both_language_schemas():
    assert _engine("en").transliterate_word("קָוָה", "H6960")["guide"] == "qaVAH"
    assert _engine("es").transliterate_word("קָוָה", "H6960")["guide"] == "qaVAH"


def test_distant_prefix_vowel_does_not_make_sheva_silent():
    transliterator = _engine("en")
    text = "מַבְגְדָ"
    sheva_index = text.index("ְ", text.index("ְ") + 1)

    assert transliterator.is_silent_sheva(text, sheva_index) is False


def test_first_of_two_shevas_closes_the_preceding_short_vowel():
    transliterator = _engine("en")
    text = "מַבְגְדָ"
    sheva_index = text.index("ְ")

    assert transliterator.is_silent_sheva(text, sheva_index) is True


def test_final_consonants_belong_to_vowel_syllables():
    engine = _engine("en")
    assert engine.split_into_syllables("miqveh") == ["miq", "veh"]
    assert engine.split_into_syllables("qavah") == ["qa", "vah"]


def test_hebrew_context_rules_and_stress_metadata():
    engine = _engine("en")
    cases = {"מֶלֶךְ": "melekh", "אוֹרְחָה": "orekhah", "עָוֺן": "avon", "אַבְרָהָם": "avraham", "מַיִם": "mayim",
             "אׇהֳלָה": "oholah", "אַנְתּוּן": "antun", "אִגְּרָא": "igera"}
    for hebrew, expected in cases.items():
        assert engine.transliterate_word(hebrew)["translit"] == expected
    result = engine.transliterate_word("קָוָה", "H6960")
    assert result["stress_syllable"] == 2
    assert result["guide_full"]["stress_note"] == "stress on VAH"
    assert " " in engine.transliterate_word("אָב יוֹם")["guide"]


def test_audit_counts_separate_words_and_reports_every_mismatch():
    from tools.bani.audit_phonology import audit, pron_syllables
    assert pron_syllables("ab-ee' ghib-one'") == ["ab", "ee", "ghib", "one"]
    report = audit([{"id": str(i), "hebrew": "אָב", "pron": "a-ba"} for i in range(101)])
    assert len(report["mismatch_examples"]) == 101
    assert not audit([])["threshold_met"]


def test_backfill_preserves_metadata_and_h3068_policy():
    from scripts.dict.update_transliterations import regenerate_bani_fields
    source = {"strong_number": "H4723", "lemma": "מִקְוֶה", "translit_en": "mikeveh", "definitions": ["hope"], "root_ref": "H6960"}
    result = regenerate_bani_fields(source)
    assert result["translit_en"] == "miqveh"
    assert result["definitions"] == source["definitions"]
    assert result["root_ref"] == source["root_ref"]
    assert regenerate_bani_fields(result) == result
    assert "translit_en" not in regenerate_bani_fields({"strong_number": "H3068", "lemma": "יְהוָה"})
