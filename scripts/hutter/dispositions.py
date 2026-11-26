"""Stable identities, persisted dispositions and Hugging Face page evidence for #157 findings.

The printed page image is authoritative. Every disposition is checked against the
current audit, the current verse text and the committed image index; a stale
precondition is an error, never a silent pass.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import os
import re
import tempfile
import urllib.request
from typing import NamedTuple

DATASET = "jhonnyisaacc/hutter"
REVISION = "0448fc8161a2f612f19264569061679a06c34397"
HUB = "https://huggingface.co"
IMAGE_INDEX = Path("data/hutter/image_index.json")
DISPOSITIONS_DIR = Path("data/hutter/dispositions")
SUMMARY = Path("data/hutter/review_reports/disposition_summary.json")
IMAGE_PREFIXES = {"data/hutter/staging/data/images/hebrew_images/": "hebrew/",
                  "data/hutter/verse_images/": "verse_images/"}
REQUIRES_REVIEW = "requires_review"


class Rule(NamedTuple):
    requires_correction: bool


DISPOSITIONS = {
    "verified_current": Rule(requires_correction=False),
    "historical_variant": Rule(requires_correction=False),
    "corrected": Rule(requires_correction=True),
    "blocked": Rule(requires_correction=False),
}
STATUSES = (*DISPOSITIONS, REQUIRES_REVIEW)


class Review(NamedTuple):
    pointing_verified: bool


LEDGER_REVIEWS = {
    "image_confirmed": Review(pointing_verified=True),
    "letters_confirmed": Review(pointing_verified=False),
}


def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def image_key(path):
    for local, remote in IMAGE_PREFIXES.items():
        if path.startswith(local):
            return remote + path[len(local):]
    raise ValueError(f"No Hugging Face location for {path}")


def local_path(key):
    for local, remote in IMAGE_PREFIXES.items():
        if key.startswith(remote):
            return local + key[len(remote):]
    raise ValueError(f"No local location for {key}")


def load_index(root):
    path = root / IMAGE_INDEX
    return json.loads(path.read_text(encoding="utf-8"))["files"] if path.exists() else {}


def require_indexed(index, path, sha256):
    entry = index.get(image_key(path))
    if entry is None or entry["sha256"] != sha256:
        raise ValueError(f"Source image changed: {path}")


def assign_ids(findings):
    ordinals = Counter()
    for finding in findings:
        evidence = finding["evidence"]
        discriminator = evidence["alternate_ocr_id"] if isinstance(evidence, dict) else evidence
        key = (finding["book"], finding["chapter"], finding["verse"], finding["error_class"], discriminator)
        identity = json.dumps([*key, ordinals[key]], ensure_ascii=False)
        ordinals[key] += 1
        finding["finding_id"] = "hutter:" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
        finding["text_sha256"] = sha256_text(finding["current_text"])


def load_dispositions(root):
    rows, errors = [], []
    for path in sorted((root / DISPOSITIONS_DIR).glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if (payload.get("schema_version"), payload.get("issue"), payload.get("book")) != (1, 157, path.stem):
            errors.append(f"{path.name}: expected schema_version 1, issue 157 and book {path.stem}")
        rows.extend({**row, "book": payload.get("book")} for row in payload.get("dispositions", []))
    return rows, errors


def validate(rows, findings, texts, corrections, index):
    by_id = {f["finding_id"]: f for f in findings}
    errors, seen = [], set()
    for row in rows:
        fid = row.get("finding_id")
        where = f"{row['book']} {row.get('chapter')}:{row.get('verse')} {fid}"
        if fid in seen:
            errors.append(f"{where}: duplicate finding_id")
        seen.add(fid)
        rule = DISPOSITIONS.get(row.get("disposition"))
        if rule is None:
            errors.append(f"{where}: unknown disposition {row.get('disposition')!r}")
            continue
        if not row.get("rationale") or not row.get("reviewer"):
            errors.append(f"{where}: rationale and reviewer are required")
        verse = (row["book"], row.get("chapter"), row.get("verse"))
        text = texts.get(verse)
        if text is None:
            errors.append(f"{where}: verse is not in the current transcription")
            continue
        if row.get("text_sha256") != sha256_text(text):
            errors.append(f"{where}: verse text changed since review")
        finding = by_id.get(fid)
        if finding is None and not rule.requires_correction:
            errors.append(f"{where}: finding is not in the current audit")
        if finding and ((finding["book"], finding["chapter"], finding["verse"]) != verse
                        or finding["error_class"] != row.get("error_class")):
            errors.append(f"{where}: finding location or class does not match")
        image = row.get("image") or {}
        if image.get("path") not in index or index[image["path"]]["sha256"] != image.get("sha256"):
            errors.append(f"{where}: image hash does not match the image index")
        elif finding and image["path"] not in {image_key(c["output_image"]) for c in finding["crops"] if c.get("output_image")} | {
                image_key(p) for p in finding["page_images"]}:
            errors.append(f"{where}: image is not evidence for this verse")
        reference = row.get("correction")
        if rule.requires_correction != (reference is not None):
            errors.append(f"{where}: correction reference is required exactly when disposition is corrected")
        if reference is not None:
            fix = corrections[reference] if isinstance(reference, int) and 0 <= reference < len(corrections) else {}
            if fix.get("review_status") not in LEDGER_REVIEWS or (fix["book"], fix["chapter"], fix["verse"]) != verse:
                errors.append(f"{where}: correction {reference!r} is not a reviewed correction of this verse")
            elif fix["after"] != text:
                errors.append(f"{where}: verse text is not the correction's after text")
    return errors


def summarize(findings, rows):
    present = {f["finding_id"] for f in findings}
    entries = [(f["error_class"], (f["book"], f["chapter"], f["verse"]), f["status"]) for f in findings]
    entries += [(r["error_class"], (r["book"], r["chapter"], r["verse"]), r["disposition"])
                for r in rows if r["finding_id"] not in present]
    groups = defaultdict(list)
    for error_class, verse, status in entries:
        groups[error_class].append((verse, status))
        groups["overall"].append((verse, status))

    def counts(items):
        return {"findings": {s: sum(st == s for _, st in items) for s in STATUSES},
                "verses": {s: len({v for v, st in items if st == s}) for s in STATUSES}}

    return {"schema_version": 1, "issue": 157,
            "by_class": {k: counts(v) for k, v in sorted(groups.items()) if k != "overall"},
            "overall": counts(groups["overall"])}


def request(url):
    headers = {"User-Agent": "hutter-dispositions"}
    if os.environ.get("HF_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['HF_TOKEN']}"
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)


def build_index():
    files = {}
    for directory in ("hebrew", "verse_images"):
        url = f"{HUB}/api/datasets/{DATASET}/tree/{REVISION}/{directory}?recursive=true"
        while url:
            with request(url) as response:
                for item in json.load(response):
                    if item["type"] == "file" and item["path"].endswith(".png"):
                        if "lfs" not in item:
                            raise ValueError(f"{item['path']} has no LFS sha256")
                        files[item["path"]] = {"sha256": item["lfs"]["oid"], "size": item["lfs"]["size"]}
                link = re.search(r'<([^>]+)>;\s*rel="next"', response.headers.get("Link", ""))
                url = link.group(1) if link else None
    return {"schema_version": 1, "dataset": DATASET, "revision": REVISION, "files": dict(sorted(files.items()))}


def fetch(root, findings, index, download):
    fetched = 0
    keys = sorted({image_key(c["output_image"]) for f in findings for c in f["crops"] if c.get("output_image")})
    for key in keys:
        if key not in index:
            raise ValueError(f"{key} is not in the image index")
        target = root / local_path(key)
        if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == index[key]["sha256"]:
            continue
        data = download(key)
        if hashlib.sha256(data).hexdigest() != index[key]["sha256"]:
            raise ValueError(f"{key} does not match the image index sha256")
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
            handle.write(data)
        Path(handle.name).replace(target)
        fetched += 1
    return fetched


def download_from_hub(key):
    with request(f"{HUB}/datasets/{DATASET}/resolve/{REVISION}/{key}") as response:
        return response.read()
