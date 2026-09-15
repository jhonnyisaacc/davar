import json
import unicodedata
from pathlib import Path

from scripts.greek.importer import build_bundle
from scripts.greek.transliteration import (
    RULE_VERSION,
    transliterate,
    transliterations,
)

FIXTURES = Path(__file__).parent / "fixtures" / "greek"


def test_stepbible_english_wins_and_gaps_use_deterministic_fallback():
    assert transliterate("Βίβλος", "en", supplied_english="Biblos") == "Biblos"
    assert transliterate("Βίβλος", "en", supplied_english="") == "Biblos"
    assert transliterate("θεός", "en") == "theos"
    assert transliterate("θεός", "es") == "teos"
    assert transliterate("θεός", "he") == "תאוס"


def test_nfc_nfd_accents_and_final_sigma_are_stable():
    nfc = "Βίβλος"
    nfd = unicodedata.normalize("NFD", nfc)
    assert transliterations(nfc) == transliterations(nfd)
    assert transliterate("λόγος", "en") == "logos"
    assert transliterate("λόγος", "es") == "logos"
    assert transliterate("Ἀβραάμ", "he").endswith("ם")


def test_vowel_and_consonant_combinations():
    assert transliterate("οὐ", "en") == "ou"
    assert transliterate("οὐ", "es") == "u"
    assert transliterate("ἄγγελος", "en") == "angelos"
    assert transliterate("ἄγγελος", "he") == "אנגאלוס"
    assert transliterate("Μωϋσῆς", "es") == "Moises"


def test_breathings_and_iota_subscript():
    assert transliterate("αἷμα", "en") == "haima"
    assert transliterate("αἷμα", "he").startswith("ה")
    assert transliterate("ᾧ", "en") == "hōi"
    assert transliterate("ᾧ", "he").endswith("י")


def test_versioned_exception_is_exact_and_deterministic():
    assert transliterate("Ἰησοῦς", "en") == "Iēsous"
    assert transliterate("Ἰησοῦς", "es") == "Iesous"
    assert transliterate("Ἰησοῦς", "he") == "איסוס"
    assert transliterate("Ἰησοῦ", "es") != "Iesous"


def test_review_example_fixture_matches_rule_version():
    payload = json.loads(
        (FIXTURES / "transliteration_examples_v1.json").read_text(encoding="utf-8")
    )
    assert payload["version"] == RULE_VERSION
    for example in payload["examples"]:
        assert (
            transliterate(
                example["greek"],
                "en",
                supplied_english=example["en"],
            )
            == example["en"]
        )
        assert transliterate(example["greek"], "es") == example["es"]
        assert transliterate(example["greek"], "he") == example["he"]


def test_importer_labels_form_and_lemma_transliterations_separately():
    bundle = build_bundle(
        [(FIXTURES / "tagnt_import_sample.tsv").read_text(encoding="utf-8")],
        (FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8"),
    )
    word = bundle["books"]["matthew"][0]["words"][0]
    assert word["text"] == "Βίβλος"
    assert word["lemma"] == "βίβλος"
    assert word["transliteration"]["rule_version"] == RULE_VERSION
    assert word["transliteration"]["form"]["en"] == "Biblos"
    assert word["transliteration"]["lemma"]["en"] == "biblos"
    assert word["lemma_translit_he"] == "ביבלוס"
    assert bundle["source"]["transliteration_rule_version"] == RULE_VERSION
