import copy
import json

import pytest

from scripts.dict import tcysite_review
from scripts.dict.tcysite_review import EntryProfile, apply_reviews, build, load_decisions, stems


def eric_row(row="0", text_es="paz"):
    return {
        "source": "tcysite-eric",
        "text_es": text_es,
        "review_status": "imported",
        "source_file": "eric/parashot.json",
        "source_row": row,
    }


def decision(row="0", text_es="paz", **fields):
    return {
        "source_file": "eric/parashot.json",
        "source_row": row,
        "text_es": text_es,
        "verdict": "approved",
        "text_en": "peace",
        "text_he": "שלום",
        "evidence": "term שָׁלוֹם",
        "reviewer": "claude-tcy-review",
        **fields,
    }


def custom(*definitions):
    return {
        "H7965": {
            "definitions": [
                {"source": "custom", "text_es": "paz", "text_en": "peace", "order": 1},
                *definitions,
            ]
        }
    }


def keyed(*decisions):
    return {(item["source_file"], item["source_row"]): item for item in decisions}


def test_eric_row_takes_its_reviewed_translation():
    data = custom(eric_row())
    report = apply_reviews(data, keyed(decision()))
    row = data["H7965"]["definitions"][1]
    assert (row["text_es"], row["text_en"], row["text_he"]) == ("paz", "peace", "שלום")
    assert (row["review_status"], row["reviewed_by"]) == ("approved", "claude-tcy-review")
    assert report["counts"] == {"tcysite-eric:approved": 1}
    assert report["unreviewed"] == []


def test_greek_rows_are_blocked_by_rule():
    greek = {"source": "tcysite-greek-strong", "text_es": "hacia", "review_status": "imported", "source_file": "greek/x.json", "source_row": "G4314"}
    data = custom(greek)
    report = apply_reviews(data, {})
    row = data["H7965"]["definitions"][1]
    assert (row["review_status"], row["review_reason"], row["reviewed_by"]) == ("blocked", "third_party_lexicon", "claude-tcy-review")
    assert "text_en" not in row and "text_he" not in row
    assert report["counts"] == {"tcysite-greek-strong:blocked": 1}


def test_changed_spanish_source_reverts_the_row_to_imported():
    data = custom(eric_row(text_es="paz completa"))
    report = apply_reviews(data, keyed(decision()))
    row = data["H7965"]["definitions"][1]
    assert row["review_status"] == "imported"
    assert "text_en" not in row
    assert report["unreviewed"] == ["H7965 eric/parashot.json#0"]


def test_decision_without_a_row_is_reported():
    report = apply_reviews(custom(eric_row()), keyed(decision(), decision(row="9")))
    assert report["orphan_decisions"] == ["eric/parashot.json#9"]


def test_blocked_and_corrected_decisions():
    blocked = decision(row="1", text_es="...", verdict="blocked", reason="source_defect")
    del blocked["text_en"], blocked["text_he"]
    corrected = decision(verdict="corrected", text_en="peace, wholeness", before={"text_en": "peace"})
    data = custom(eric_row(), eric_row(row="1", text_es="..."))
    report = apply_reviews(data, keyed(corrected, blocked))
    first, second = data["H7965"]["definitions"][1:]
    assert (first["review_status"], first["text_en"]) == ("approved", "peace, wholeness")
    assert (second["review_status"], second["review_reason"]) == ("blocked", "source_defect")
    assert report["counts"] == {"tcysite-eric:blocked": 1, "tcysite-eric:corrected": 1}


def test_decision_entry_moves_the_row_and_drops_an_emptied_import():
    data = {
        "H8007": {"imported_by": "tcysite", "definitions": [{**eric_row(), "term_language": "hebrew", "order": 1}]},
        "H8001": {"definitions": [{"source": "custom", "text_es": "paz", "order": 4}]},
    }
    decisions = keyed(decision(entry="H8001"))
    apply_reviews(data, decisions)
    once = copy.deepcopy(data)
    apply_reviews(data, decisions)
    assert data == once
    assert "H8007" not in data
    moved = data["H8001"]["definitions"][1]
    assert (moved["source"], moved["order"], moved["text_he"]) == ("tcysite-eric", 5, "שלום")


def test_apply_is_idempotent():
    data = custom(eric_row(), {"source": "tcysite-greek-master", "text_es": "x", "review_status": "imported", "source_file": "greek/m.json", "source_row": "1"})
    decisions = keyed(decision())
    apply_reviews(data, decisions)
    once = copy.deepcopy(data)
    apply_reviews(data, decisions)
    assert data == once


@pytest.mark.parametrize(
    ("fields", "error"),
    [
        ({"text_he": "shalom"}, "text_he has no Hebrew letters"),
        ({"verdict": "blocked", "reason": "source_defect"}, "blocked decision carries a translation"),
        ({"verdict": "corrected"}, "corrected decision without before"),
        ({"reviewer": ""}, "missing reviewer"),
        ({"entry_checked": "Hashem"}, "invalid entry_checked"),
    ],
)
def test_invalid_decisions_are_rejected(tmp_path, fields, error):
    path = tmp_path / "decisions.jsonl"
    path.write_text(json.dumps(decision(**fields), ensure_ascii=False) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match=error):
        load_decisions(path)


def test_committed_data_reviews_every_tcy_row():
    text, report = build()
    assert report["unreviewed"] == []
    assert report["orphan_decisions"] == []
    assert report["entry_flags"] == []
    assert tcysite_review.CUSTOM_PATH.read_text(encoding="utf-8") == text
    assert json.loads(tcysite_review.REPORT_PATH.read_text(encoding="utf-8")) == report


PROFILES = {
    "H7965": EntryProfile(proper=False, stems=stems("completeness, peace, welfare")),
    "H8007": EntryProfile(proper=True, stems=stems("Salma, an Israelite")),
    "H4695": EntryProfile(proper=False, stems=stems("a quarrel")),
}


def test_row_on_a_proper_name_entry_is_flagged_until_moved_or_checked():
    data = {"H8007": {"definitions": [eric_row()]}}
    report = apply_reviews(copy.deepcopy(data), keyed(decision()), PROFILES)
    assert report["entry_flags"] == ["H8007 eric/parashot.json#0 proper_name"]
    assert apply_reviews(copy.deepcopy(data), keyed(decision(entry="H7965")), PROFILES)["entry_flags"] == []
    assert apply_reviews(copy.deepcopy(data), keyed(decision(entry_checked="H8007")), PROFILES)["entry_flags"] == []


def test_row_sharing_no_sense_with_its_entry_is_flagged():
    data = {"H4695": {"definitions": [eric_row(text_es="panes sin levadura")]}}
    unleavened = decision(text_es="panes sin levadura", text_en="unleavened breads", text_he="מצות")
    report = apply_reviews(data, keyed(unleavened), PROFILES)
    assert report["entry_flags"] == ["H4695 eric/parashot.json#0 no_shared_sense"]


def test_row_sharing_a_sense_or_blocked_is_not_flagged():
    blocked = decision(verdict="blocked", reason="entry_unresolved")
    del blocked["text_en"], blocked["text_he"]
    assert apply_reviews(custom(eric_row()), keyed(decision()), PROFILES)["entry_flags"] == []
    data = {"H8007": {"definitions": [eric_row()]}}
    assert apply_reviews(data, keyed(blocked), PROFILES)["entry_flags"] == []


def test_an_entry_check_for_another_entry_does_not_cover_this_one():
    data = {"H8007": {"definitions": [eric_row()]}}
    report = apply_reviews(data, keyed(decision(entry_checked="H7965")), PROFILES)
    assert report["entry_flags"] == ["H8007 eric/parashot.json#0 proper_name"]
