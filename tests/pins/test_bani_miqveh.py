from pathlib import Path

from tools.bani.apply import Transliterator, load_jsonc

_SCHEMA = Path(__file__).resolve().parents[2] / "tools" / "bani" / "schemas" / "en.json"


def test_miqveh_h4723_golden_transliteration():
    result = Transliterator(load_jsonc(_SCHEMA)).transliterate_word("מִקְוֶה", "H4723")

    assert result == {
        "hebrew": "מִקְוֶה",
        "translit": "miqveh",
        "stress_syllable": 1,
        "guide": "MIQveh",
        "guide_full": {
            "reference": "",
            "stress_note": "stress on MIQ",
            "phonetic_notes": [],
        },
    }
