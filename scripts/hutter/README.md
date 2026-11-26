# Hutter Hebrew Pipeline

This package contains Davar-side tooling for the Elias Hutter Hebrew extraction work.

## Current State

- Migrated Shafan assets live under `data/hutter/staging/`.
- Existing JSON output is page-oriented: each verse includes `source_files`, usually one cropped page image like `000002.png`.
- The new experiment starts from that JSON and divides each page image into verse-level image candidates.

## Verse Image Experiment

Create a manifest only:

```bash
python -m scripts.hutter.verse_images matthew --manifest-only
```

Audit source mappings and structural edge cases without reading image pixels:

```bash
python -m scripts.hutter.verse_images all --audit-only
```

Create verse crops and a manifest:

```bash
python -m scripts.hutter.verse_images matthew
```

Preview one source page:

```bash
python -m scripts.hutter.verse_images matthew --source-files 000002.png
```

Compute crop boxes without writing cropped image files:

```bash
python -m scripts.hutter.verse_images all --crop-plan-only
```

Process every Hutter book that has both images and JSON:

```bash
python -m scripts.hutter.verse_images all
```

Outputs:

```text
data/hutter/verse_images/<book>/*.png
data/hutter/manifests/<book>_verse_images.json
```

Build the repeatable review report and local contact sheets:

```bash
python -m scripts.hutter.review_verse_images
```

Review outputs:

```text
data/hutter/review_reports/verse_image_review.json
data/hutter/review_reports/sheets/shortest_crops.png
data/hutter/review_reports/sheets/highest_edge_crops.png
data/hutter/review_reports/sheets/first_last_by_book.png
```

The review report also records source availability. As of this pass, the only
books processable by the verse-image pipeline are the books that have both
`staging/output/<book>.json` and `staging/data/images/hebrew_images/<book>/`.
The Old Testament JSON files currently have no local Hutter image folders in
this staging tree, and `laodikim` currently has local images but no matching
JSON source mapping.

The cropper currently uses the existing transcription JSON as the verse/page assignment source of truth. It does not call external OCR. It reads PNG pixels locally, detects the Hebrew column's vertical ruling lines, detects horizontal whitespace gaps in that Hebrew column area, and cuts column-width verse bands with padding so Hebrew content is not clipped. Pages that begin at verse 1 get extra header handling; pages that begin mid-chapter keep the top scan permissive so early verse text is preserved. Crop manifests also record structural notes for first verses, last verses, chapter-transition pages, and basic scan-quality metrics when pixel analysis is enabled.

Important limitation: this removes neighboring side columns, but some Hutter pages also include a Latin/Spanish gloss directly inside the Hebrew column under the Hebrew text. Those in-column gloss lines are still present in the current crops. Do not treat these as strict Hebrew-only crops until a second pass trims each verse band down to the Hebrew glyph block itself.

Use `--manifest-only` when reviewing source mappings without checking file existence. Use `--audit-only` when reviewing source mappings, missing images, first/last verse cases, and chapter transitions without reading image pixels. Use `--crop-plan-only` when validating segmentation on targeted pages before generating cropped PNGs.

## API OCR Pilot

Run a small dry run before spending API tokens:

```bash
.venv/bin/python -m scripts.hutter.process_verses_api colossians --limit 6 --batch-size 3 --dry-run
```

Process a small batch with checkpointing:

```bash
.venv/bin/python -m scripts.hutter.process_verses_api colossians --limit 6 --batch-size 3
```

The runner loads `OPENAI_API_KEY` from the environment or repo `.env`, compresses verse crops before upload, writes raw batch responses plus normalized per-verse rows, and skips already completed verse ids on later runs. Use `--ocr-preprocess --scale 2 --image-format png` only for targeted retries where niqqud fidelity is poor; it can cost materially more tokens per image.

Review the API output:

```bash
.venv/bin/python -m scripts.hutter.review_api_results colossians
```

Summarize all processed GPT OCR books and compare them to their manifests:

```bash
.venv/bin/python -m scripts.hutter.summarize_api_results --results-root data/hutter/api_results_gpt55
```

Outputs:

```text
data/hutter/api_results/<book>/batches.jsonl
data/hutter/api_results/<book>/results.jsonl
data/hutter/api_results/<book>/review.json
data/hutter/api_results_gpt55/summary.json
```

## Image-authoritative transcription QA (#155)

The transcription audit scans every verse, including words already assigned a
Strong number. It does not use Strong candidates to change Hebrew spelling.

```bash
.venv/bin/python -m scripts.hutter.audit_transcription --output data/hutter/review_reports/transcription_audit.json.gz
.venv/bin/python -m scripts.hutter.audit_transcription --apply-reviewed --output data/hutter/review_reports/transcription_audit.json.gz
.venv/bin/python -m scripts.hutter.map_strongs --write
bun run --cwd web generate-data
.venv/bin/python -m scripts.hutter.verify_transcription
.venv/bin/python -m pytest -q tests/test_hutter_transcription.py tests/test_hutter_map_strongs.py tests/test_hutter_verse_images.py
```

`transcription_corrections.json` stores exact before/after verses, reviewed spans,
page/crop locations, image SHA-256 hashes and evidence. Apply validates all image
and text preconditions before writing; repeat application changes nothing.
Each row has a `review_status`. `image_confirmed` means the letters and the
pointing were checked against the page. `letters_confirmed` means the letters,
word order and punctuation were checked, and the pointing is an unverified best
reading. The audit keeps every verse whose text comes from a `letters_confirmed`
row in the queue as a `pointing_unverified` finding. Rows apply in order, so a
later row for the same verse supersedes an earlier one; its `before` is the
earlier row's `after`. Apply and `map_strongs` check each page hash against
`data/hutter/image_index.json`, so no local page images are needed.
The report is gzip-compressed with a fixed timestamp for deterministic bytes;
inspect it using `gzip -dc data/hutter/review_reports/transcription_audit.json.gz`.
`transcription_summary.json` records the before/after metrics and export checks.

This pass inspected representative images in all 27 books, repaired 23 verses,
and corrected crop boundaries on four source pages. It does **not** establish
corpus-wide character accuracy. The remaining OCR disagreements, repeated-word
candidates and multi-page cases are explicitly queued for image review.
Alternate OCR sometimes contradicts the printed page: Galatians 3:9, Matthew
6:4, Revelation 12:8 and 2 Thessalonians 3:4 retain the printed Hutter forms.
NFC-equivalent sequences are counted separately from transcription errors.
Historical defective spellings are not normalized to Delitzsch.

The verifier compares the pre-pass snapshot `2fdb23cad` with this ledger, checks
that other verses are unchanged, and checks all repaired verses in mappings,
web chapter JSON and the mobile offline Hutter bundle. Generated bundles are
not tracked; regenerate them before running the verifier.

`map_strongs --write` regenerates every book and refuses a coverage drop. To
replace only the reviewed verses of issues 127 and 411 and keep every other
published mapping, run
`.venv/bin/python -m scripts.hutter.map_strongs --reviewed-transcriptions-only --write`.

### Finding dispositions (#157)

The page images live in the Hugging Face dataset `jhonnyisaacc/hutter` at a
pinned revision. `data/hutter/image_index.json` records the SHA-256 and size of
every page and verse crop there. The audit checks page evidence against this
index, not against the local disk. Rebuild the index from metadata only with
`--build-index`.

Every finding has a `finding_id` that does not depend on verse text, so it
survives a correction, and a `text_sha256` of the current verse. Reviews go in
`data/hutter/dispositions/<book>.json`, one file per book. A disposition is
`verified_current`, `historical_variant`, `corrected` or `blocked`. Each row
records the verse text hash, the image path and hash, a rationale and the
reviewer. A `corrected` row also gives the index of a reviewed entry in
`transcription_corrections.json`. The audit fails when a row is stale: the
finding is gone (only a `corrected` row may outlive its finding), the verse text
or image hash changed, or the correction is not applied. Each finding's
`status` is its disposition, or `requires_review`. The audit also writes
`review_reports/disposition_summary.json` with finding and distinct-verse
counts per class and status.

```bash
.venv/bin/python -m scripts.hutter.audit_transcription --fetch philemon
.venv/bin/python -m scripts.hutter.audit_transcription --fetch philemon --finding hutter:6d78c612ca4dde61
```

`--fetch` downloads only the verse crops of findings that still require review
into the ignored `data/hutter/verse_images/`. It skips files that already match
the index and fails when a download does not match it.

## API morphology review (audit-only)

The deterministic queue can be sent to an OpenAI-compatible endpoint for a
closed-set second opinion. The model may select only a candidate already in
`morphology_review_queue.json`, or abstain. The runner never writes Hutter
mappings and records raw responses in a checkpoint JSONL file.

Inspect the first request without network access:

```bash
python -m scripts.hutter.review_morphology_api --limit 8 --dry-run
```

Run a small OpenRouter pilot with the cost-conscious DeepSeek model:

```bash
OPENROUTER_API_KEY=... \\
python -m scripts.hutter.review_morphology_api \\
  --model deepseek/deepseek-v4-flash-0731 --limit 100 --batch-size 8
```

Use MiMo as a second opinion on disagreements rather than on the whole queue:

```bash
OPENROUTER_API_KEY=... \\
python -m scripts.hutter.review_morphology_api \\
  --model xiaomi/mimo-v2.5 --limit 100 --batch-size 4 \\
  --output data/hutter/review_reports/morphology_mimo_proposals.jsonl \\
  --summary data/hutter/review_reports/morphology_mimo_summary.json
```

`proposed` rows are suggestions for a later validation step; `abstain` and
`error` rows must not be treated as mappings. Evaluate proposals against a
held-out reviewed set before applying anything to the corpus. The prompt and
parser enforce the closed candidate set, JSON shape, and explicit abstention.
