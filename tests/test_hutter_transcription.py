import copy
import hashlib
import json

import pytest

from scripts.hutter import dispositions as disp
from scripts.hutter.audit_transcription import LEDGER, SOURCE, ROOT, apply_ledger, audit, read, write, verses

PAGE = "hebrew/john/000002.png"
PAGE_SHA = hashlib.sha256(b"fixture page evidence").hexdigest()


def fixture(root, review_status="image_confirmed"):
    write(root / disp.IMAGE_INDEX, {"schema_version": 1, "files": {PAGE: {"sha256": PAGE_SHA, "size": 21}}})
    row = {"book": "john", "chapter": 1, "verse": 1, "source_image": disp.local_path(PAGE),
           "source_image_sha256": PAGE_SHA, "before": "אב", "after": "אבא",
           "review_status": review_status, "evidence": "fixture"}
    write(root / LEDGER, {"corrections": [row]})
    write(root / SOURCE / "john.json", {"chapters": [{"number": 1, "verses": [
        {"number": 1, "text_nikud": "אב", "source_files": ["000002.png"]},
        {"number": 2, "text_nikud": "שמור", "source_files": ["000002.png"]}]}]})
    write(root / "data/hutter/strong_mappings/john.json", {})
    return row


def pointing_flags(root):
    return [(f["verse"], f["status"]) for f in audit(root)["findings"] if f["error_class"] == "pointing_unverified"]


def test_apply_is_selective_and_idempotent(tmp_path):
    fixture(tmp_path)
    assert apply_ledger(tmp_path) == 1
    path = tmp_path / SOURCE / "john.json"
    first = path.read_bytes()
    assert apply_ledger(tmp_path) == 0
    assert path.read_bytes() == first
    assert read(path)["chapters"][0]["verses"][1]["text_nikud"] == "שמור"


def test_stale_text_or_changed_image_blocks_all_writes(tmp_path):
    row = fixture(tmp_path)
    second = copy.deepcopy(row)
    second.update(verse=2, before="stale", after="replacement")
    write(tmp_path / LEDGER, {"corrections": [row, second]})
    path = tmp_path / SOURCE / "john.json"
    original = path.read_bytes()
    with pytest.raises(ValueError, match="Stale transcription"):
        apply_ledger(tmp_path)
    assert path.read_bytes() == original
    write(tmp_path / disp.IMAGE_INDEX, {"schema_version": 1, "files": {PAGE: {"sha256": "0" * 64, "size": 7}}})
    with pytest.raises(ValueError, match="Source image changed"):
        apply_ledger(tmp_path)
    assert path.read_bytes() == original


def test_unreviewed_ocr_cannot_change_transcription(tmp_path):
    row = fixture(tmp_path)
    row["review_status"] = "ocr_suggestion"
    write(tmp_path / LEDGER, {"corrections": [row]})
    with pytest.raises(ValueError, match="image-reviewed"):
        apply_ledger(tmp_path)
    assert read(tmp_path / SOURCE / "john.json")["chapters"][0]["verses"][0]["text_nikud"] == "אב"


@pytest.mark.parametrize(("review_status", "flags"), [("image_confirmed", []),
                                                       ("letters_confirmed", [(1, "requires_review")])])
def test_letters_confirmed_correction_applies_and_stays_queued_for_pointing_review(tmp_path, review_status, flags):
    fixture(tmp_path, review_status)
    assert pointing_flags(tmp_path) == []
    assert apply_ledger(tmp_path) == 1
    assert read(tmp_path / SOURCE / "john.json")["chapters"][0]["verses"][0]["text_nikud"] == "אבא"
    assert pointing_flags(tmp_path) == flags


def test_a_later_row_supersedes_an_earlier_correction_of_the_same_verse(tmp_path):
    row = fixture(tmp_path)
    later = {**row, "before": "אבא", "after": "אבאב", "review_status": "letters_confirmed"}
    write(tmp_path / LEDGER, {"corrections": [row, later]})
    assert apply_ledger(tmp_path) == 2
    assert apply_ledger(tmp_path) == 0
    assert read(tmp_path / SOURCE / "john.json")["chapters"][0]["verses"][0]["text_nikud"] == "אבאב"
    assert pointing_flags(tmp_path) == [(1, "requires_review")]
    final = {**later, "before": "אבאב", "after": "אבאבא", "review_status": "image_confirmed"}
    write(tmp_path / LEDGER, {"corrections": [row, later, final]})
    assert apply_ledger(tmp_path) == 1
    assert pointing_flags(tmp_path) == []


def test_audit_covers_mapped_words_and_is_deterministic(tmp_path):
    fixture(tmp_path)
    write(tmp_path / "data/hutter/strong_mappings/john.json", {"strong": "H1"})
    first = audit(tmp_path)
    assert first == audit(tmp_path)
    assert first["totals"]["verses"] == 2
    assert first["finding_counts"]["missing_niqqud"] == 2
    assert "missing_page_evidence" not in first["finding_counts"]


def test_review_ledger_spans_all_27_books_and_keeps_verifiable_provenance():
    ledger = read(ROOT / LEDGER)
    assert len({r["book"] for r in ledger["representative_reviews"]}) == 27
    governing = {(r["book"], r["chapter"], r["verse"]): r for r in ledger["corrections"]}
    for row in ledger["corrections"]:
        assert row["before"] != row["after"]
        assert len(row["source_image_sha256"]) == 64
        assert row["evidence"] and row["review_status"] in disp.LEDGER_REVIEWS
    for (book, chapter, verse), row in governing.items():
        source = dict(verses(read(ROOT / SOURCE / f"{book}.json")))
        assert source[(chapter, verse)]["text_nikud"] == row["after"]
    flagged = {(f["book"], f["chapter"], f["verse"]) for f in audit(ROOT)["findings"]
               if f["error_class"] == "pointing_unverified" and f["status"] == "requires_review"}
    assert flagged == {key for key, row in governing.items() if row["review_status"] == "letters_confirmed"}
