from scripts.translit.dss_processor import resolve_dss_transliteration
from scripts.translit.local_translit import LocalTransliterator


def test_editorial_dss_transliteration_wins_over_local_fallback():
    result = resolve_dss_transliteration(
        {
            "dss_word": "אל המשפט",
            "dss_translit_en": "el hammishpat",
            "dss_translit_es": "el hammishpat",
        },
        LocalTransliterator(),
    )
    assert result == ("el hammishpat", "el hammishpat", "editorial", "high")


def test_reordered_mult_word_dss_variant_is_transliterated_as_dss_surface():
    en, es, source, confidence = resolve_dss_transliteration(
        {"dss_word": "ואבשלום יעשה לו"}, LocalTransliterator()
    )
    # The local baseline is intentionally conservative for unpointed forms;
    # an editorial or xAI-vocalized value can replace it deterministically.
    assert en == "vvshlvm yshh lv"
    assert es == "vvshlvm yshh lv"
    assert source == "local_rule"
    assert confidence == "medium"