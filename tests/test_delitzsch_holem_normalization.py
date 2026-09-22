

from scripts.delitzsch.hebrew_utils import normalize_delitzsch_holem
from scripts.delitzsch.normalize_delitzsch_holem import normalize_book_data


def test_normalize_delitzsch_holem_replaces_non_shin_sin_dots():
    assert normalize_delitzsch_holem("לׂא הָאֱלׂהִים אׂמֵר") == "לֹא הָאֱלֹהִים אֹמֵר"


def test_normalize_delitzsch_holem_preserves_real_sin_dots_on_shin():
    assert normalize_delitzsch_holem("שׂאל הַשּׂמֵר וְנְשָׂא") == "שׂאל הַשּׂמֵר וְנְשָׂא"


def test_normalize_book_data_updates_text_nikud_only():
    data = {
        "chapters": [
            {
                "number": 1,
                "verses": [
                    {"number": 1, "text_nikud": "וְזׂאת שִׂמְחָה"},
                    {"number": 2, "text_nikud": "שׂאל"},
                ],
            }
        ]
    }

    stats = normalize_book_data(data)

    assert stats.changed is True
    assert stats.verses_changed == 1
    assert stats.replacements == 1
    assert data["chapters"][0]["verses"][0]["text_nikud"] == "וְזֹאת שִׂמְחָה"
    assert data["chapters"][0]["verses"][1]["text_nikud"] == "שׂאל"
