import hashlib
import json

import pytest

from scripts.hutter import dispositions as disp
from scripts.hutter.audit_transcription import LEDGER, ROOT, SOURCE, apply_ledger, audit, read, write

PAGE = "hebrew/john/000002.png"
CROP = "verse_images/john/001_001_000002.png"
OTHER_CROP = "verse_images/john/001_002_000002.png"
CROP_BYTES = b"fixture verse crop"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fixture(root, index=True):
    page = root / "pages/000002.png"
    page.parent.mkdir()
    page.write_bytes(b"fixture page evidence")
    write(root / LEDGER, {"corrections": [
        {"book": "john", "chapter": 1, "verse": 1, "source_image": "pages/000002.png",
         "source_image_sha256": sha(page.read_bytes()), "before": "אב", "after": "אבא",
         "review_status": "image_confirmed", "evidence": "fixture"}]})
    write(root / SOURCE / "john.json", {"chapters": [{"number": 1, "verses": [
        {"number": 1, "text_nikud": "אב", "source_files": ["000002.png"]},
        {"number": 2, "text_nikud": "שמור", "source_files": ["000002.png"]}]}]})
    write(root / "data/hutter/strong_mappings/john.json", {})
    write(root / "data/hutter/manifests/john_verse_images.json", {"entries": [
        {"chapter": 1, "verse": 1, "source_image": disp.local_path(PAGE), "output_image": disp.local_path(CROP),
         "crop_box": {}, "status": "cropped"}]})
    ocr = root / "data/hutter/api_results_gpt55/john/results.jsonl"
    ocr.parent.mkdir(parents=True)
    ocr.write_text(json.dumps({"id": "john.1.1.000002", "status": "ok", "hebrew_text": "אבג"}) + "\n", encoding="utf-8")
    if index:
        write(root / disp.IMAGE_INDEX, {"schema_version": 1, "files": {
            PAGE: {"sha256": sha(b"page"), "size": 4},
            CROP: {"sha256": sha(CROP_BYTES), "size": len(CROP_BYTES)},
            OTHER_CROP: {"sha256": sha(b"other"), "size": 5}}})


def ocr_finding(report):
    return next(f for f in report["findings"] if f["error_class"] == "ocr_disagreement")


def row_for(finding, disposition="verified_current", **extra):
    return {"finding_id": finding["finding_id"], "chapter": finding["chapter"], "verse": finding["verse"],
            "error_class": finding["error_class"], "disposition": disposition, "text_sha256": finding["text_sha256"],
            "image": {"path": CROP, "sha256": sha(CROP_BYTES)}, "rationale": "Printed page agrees",
            "reviewer": "fixture", **extra}


def write_dispositions(root, rows, book="john"):
    write(root / disp.DISPOSITIONS_DIR / "john.json",
          {"schema_version": 1, "issue": 157, "book": book, "dispositions": rows})


def test_missing_page_evidence_is_judged_against_the_image_index(tmp_path):
    fixture(tmp_path, index=False)
    assert audit(tmp_path)["finding_counts"]["missing_page_evidence"] == 2
    write(tmp_path / disp.IMAGE_INDEX, {"schema_version": 1, "files": {PAGE: {"sha256": sha(b"page"), "size": 4}}})
    assert "missing_page_evidence" not in audit(tmp_path)["finding_counts"]


def test_finding_id_survives_a_text_correction(tmp_path):
    fixture(tmp_path)
    before = ocr_finding(audit(tmp_path))
    apply_ledger(tmp_path)
    after = ocr_finding(audit(tmp_path))
    assert after["current_text"] == "אבא"
    assert after["finding_id"] == before["finding_id"]
    assert after["text_sha256"] == sha("אבא".encode()) != before["text_sha256"]


def test_repeated_findings_in_one_verse_get_distinct_stable_ids():
    def findings():
        base = {"book": "john", "chapter": 1, "verse": 1, "current_text": "אב",
                "error_class": "possible_duplicated_word", "evidence": "Adjacent repeated form"}
        rows = [dict(base), dict(base), {**base, "evidence": "other"}]
        disp.assign_ids(rows)
        return [r["finding_id"] for r in rows]

    assert len(set(findings())) == 3
    assert findings() == findings()


@pytest.mark.parametrize("disposition", ["verified_current", "historical_variant", "blocked"])
def test_uncorrected_dispositions_become_the_finding_status(tmp_path, disposition):
    fixture(tmp_path)
    write_dispositions(tmp_path, [row_for(ocr_finding(audit(tmp_path)), disposition)])
    report = audit(tmp_path)
    assert ocr_finding(report)["status"] == disposition
    assert {f["status"] for f in report["findings"] if f["error_class"] != "ocr_disagreement"} == {"requires_review"}


def test_corrected_disposition_needs_the_applied_correction_and_may_outlive_its_finding(tmp_path):
    fixture(tmp_path)
    finding = ocr_finding(audit(tmp_path))
    row = row_for(finding, "corrected", correction=0, text_sha256=sha("אבא".encode()), finding_id="hutter:resolved")
    write_dispositions(tmp_path, [row])
    with pytest.raises(ValueError, match="verse text changed"):
        audit(tmp_path)
    apply_ledger(tmp_path)
    report = audit(tmp_path)
    assert ocr_finding(report)["status"] == "requires_review"
    summary = disp.summarize(report["findings"], disp.load_dispositions(tmp_path)[0])
    assert summary["by_class"]["ocr_disagreement"]["findings"]["corrected"] == 1


def replace(**fields):
    return lambda row: [{**row, **fields}]


INVALID = {
    "unknown disposition": (replace(disposition="looks_fine"), "unknown disposition"),
    "missing rationale": (replace(rationale=""), "rationale and reviewer"),
    "stale text": (replace(text_sha256=sha(b"old")), "verse text changed"),
    "absent finding": (replace(finding_id="hutter:0000000000000000"), "not in the current audit"),
    "wrong class": (replace(error_class="missing_niqqud"), "location or class"),
    "changed image": (replace(image={"path": CROP, "sha256": sha(b"changed")}), "image hash"),
    "unindexed image": (replace(image={"path": "verse_images/john/x.png", "sha256": sha(CROP_BYTES)}), "image hash"),
    "foreign image": (replace(image={"path": OTHER_CROP, "sha256": sha(b"other")}), "not evidence for this verse"),
    "reference on uncorrected": (replace(correction=0), "exactly when disposition is corrected"),
    "corrected without reference": (replace(disposition="corrected"), "exactly when disposition is corrected"),
    "unknown correction": (replace(disposition="corrected", correction=7), "not an image-confirmed correction"),
    "correction not applied": (replace(disposition="corrected", correction=0), "not the correction's after text"),
    "duplicate": (lambda row: [row, row], "duplicate finding_id"),
}


@pytest.mark.parametrize("name", sorted(INVALID))
def test_each_invalid_disposition_fails_closed(tmp_path, name):
    fixture(tmp_path)
    build, message = INVALID[name]
    write_dispositions(tmp_path, build(row_for(ocr_finding(audit(tmp_path)))))
    with pytest.raises(ValueError, match=message):
        audit(tmp_path)


def test_disposition_file_must_name_its_own_book(tmp_path):
    fixture(tmp_path)
    write_dispositions(tmp_path, [row_for(ocr_finding(audit(tmp_path)))], book="mark")
    with pytest.raises(ValueError, match="book john"):
        audit(tmp_path)


def test_summary_counts_findings_and_distinct_verses_per_status():
    findings = [{"finding_id": str(i), "book": "john", "chapter": 1, "verse": v, "error_class": c, "status": s}
                for i, (v, c, s) in enumerate([(1, "ocr_disagreement", "requires_review"),
                                                (1, "possible_duplicated_word", "requires_review"),
                                                (2, "ocr_disagreement", "blocked"),
                                                (3, "ocr_disagreement", "requires_review")])]
    summary = disp.summarize(findings, [])
    assert summary["by_class"]["ocr_disagreement"]["findings"] == {
        "verified_current": 0, "historical_variant": 0, "corrected": 0, "blocked": 1, "requires_review": 2}
    assert summary["overall"]["findings"]["requires_review"] == 3
    assert summary["overall"]["verses"]["requires_review"] == 2


def test_fetch_downloads_only_missing_or_stale_crops_and_rejects_bad_bytes(tmp_path):
    index = {CROP: {"sha256": sha(CROP_BYTES)}, OTHER_CROP: {"sha256": sha(b"other")}}
    findings = [{"crops": [{"output_image": disp.local_path(CROP)}]}, {"crops": [{"output_image": disp.local_path(OTHER_CROP)}]}]
    calls = []

    def download(key):
        calls.append(key)
        return {CROP: CROP_BYTES, OTHER_CROP: b"other"}[key]

    assert disp.fetch(tmp_path, findings, index, download) == 2
    assert disp.fetch(tmp_path, findings, index, download) == 0
    assert calls == [CROP, OTHER_CROP]
    (tmp_path / disp.local_path(CROP)).write_bytes(b"stale")
    with pytest.raises(ValueError, match="does not match"):
        disp.fetch(tmp_path, findings, index, lambda key: b"tampered")
    assert (tmp_path / disp.local_path(CROP)).read_bytes() == b"stale"


def test_committed_audit_index_and_summary_agree():
    report = audit(ROOT)
    assert "missing_page_evidence" not in report["finding_counts"]
    assert len({f["finding_id"] for f in report["findings"]}) == len(report["findings"])
    summary = disp.summarize(report["findings"], disp.load_dispositions(ROOT)[0])
    assert read(ROOT / disp.SUMMARY) == summary
