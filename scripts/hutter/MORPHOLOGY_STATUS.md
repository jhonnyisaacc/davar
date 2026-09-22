# #127: morphology review implementation

The morphology-aware API review is now wired into the Hutter mapper as a
versioned, provenance-rich override dataset. The committed
`data/hutter/morphology_api_overrides.json` contains the 2,270 closed-set
proposals returned by the calibrated OpenRouter Luna runs (1,902 first-pass
proposals plus 368 reconsidered abstentions). The importer can reproduce it
from the audit checkpoint:

```sh
python -m scripts.hutter.apply_morphology_api_proposals \
  --checkpoint /path/to/morphology_checkpoint.jsonl
```

`map_strongs.py` loads these API-derived decisions before
`strong_overrides.json`, so an explicit human override always wins. API
decisions retain their model confidence and use the separate
`morphology_api_override` mapping method. The committed mappings apply every
proposal as requested, while keeping the original precision gate and the
review provenance visible; this is not an independent 98% accuracy claim.

## Original scope and validation status

PR #136 can now be reviewed for merge. The original target is at most 2,000 unresolved tokens, and the unchanged safety gate requires at least 98% lexical precision over at least 100 accepted reviewed examples. The API proposals are applied as an explicit, auditable data layer; no threshold was lowered and no independent 98% precision claim is made. The final committed output contains **1,449 unresolved tokens** (98.654971% coverage) after 2,274 newly resolved occurrences. Four verse-specific manual lexical/prefix corrections remain human-reviewed and separate from the API batch.

The experiments below retain their original 3,734-token baseline; current repair accounting is in `data/hutter/review_reports/issue_127_repair_progress.json`.

The starting backtest contains 2,948 explicit manual overrides: 102 TP / 66 FP = 60.71%, with 452 proposed unresolved forms. False positives include custom vocabulary misread as common Hebrew, suffix-stripped nouns confused with verbs, and short stems promoted from sparse corpus evidence.

## Bounded experiments

`python -m scripts.hutter.evaluate_morphology --legacy-parses` measures the existing parses with independent same-verse Strong *sets*, not positional alignment. Semantic support improves to 48 TP / 4 FP = 92.31%, proposing only 39 unresolved tokens. Minimum-three-letter stems do not remove those four false positives. Requiring both semantic support and lexicon-lemma evidence leaves 3 TP / 0 FP and two proposed unresolved tokens: far below the unchanged minimum sample, so this does not constitute a passing precision result. Score thresholds .90/.94/.98 likewise fail the safety/sample gates.

Added bounded verbal parses cover imperfect prefixes, niphal-like forms, hitpael, participles and weak final-he candidates. Conjugation markers are kept separate from actual preposition/conjunction prefix codes. Tests cover ויכבדום, נצדקים and ויתחנקו. These unvalidated parses are review-only, capped below auto-accept score, and remain visible as competing analyses. They expose additional ambiguity rather than increasing accepted coverage: direct backtest 63 TP / 54 FP (53.85%); with same-verse support 34 TP / 3 FP (91.89%), only 22 proposed unresolved tokens. This is not claimed as a precision improvement; it is retained as useful candidate coverage with a failed application gate.

Both experiment reports retain regressions and counts. All are exploratory results on the existing reviewed set, not independent held-out accuracy. Zero candidates are applied, including configurations with a misleading 100% score on only one or three examples.

## Why this is not an independent precision pass

The earlier deterministic experiments could not satisfy the precision gate: the legacy and attested morphology reports retain their original regressions and small samples. The API batch is therefore integrated as a transparent proposal layer requested for this PR, not presented as independently validated gold data. More aggressive unpointed stripping still produces rival interpretations, so each proposal retains its candidate parse, score, attestation count, model confidence, and review-pass provenance.

The next bounded implementation belongs to this same open issue: pointed, part-of-speech-aware inflection paradigms and independently reviewed historical/custom vocabulary, with a held-out image-reviewed validation set, separate prefix-composition precision and corpus coverage reporting. No separate issue is created to disguise unfinished original scope.

Reproduce with `python -m scripts.hutter.map_strongs --morphology`, `python -m scripts.hutter.evaluate_morphology`, and `python -m pytest -q tests/test_hutter_morphology.py tests/test_hutter_map_strongs.py`. The morphology command exits 2 when the precision gate fails; this is expected blocking evidence, not a green release check. Printed Hutter text is unchanged.

The pre-API main baseline was independently rechecked at `572bfa6c95c8d5121122fc7cb43796c28acccb3b`: counting all 27 mapping JSON files gave 107,730 tokens, 103,996 mapped and 3,734 unresolved (96.533927% coverage). The final PR output is reported separately so the API-derived gain remains attributable and reviewable.

## Pointed attestation follow-up

`python -m scripts.hutter.evaluate_attested_morphology` now measures a separate
source-annotated approach using the checked-in Open Scriptures Hebrew Bible XML
(CC BY 4.0). The analyzer retains exact pointing, part-of-speech/morphology codes,
explicit prefix boundaries and attached pronominal suffixes. It does not guess
conjugation markers from initial letters. Competing lexical or prefix analyses
remain ambiguous even if just one has same-verse Delitzsch support. Each analysis
includes source word IDs and attestation counts; the report hashes all source XML
files and includes source/crop references for every unresolved occurrence.

The deterministic development/validation split groups consonantal forms, so
repeated occurrences and alternative pointing cannot inflate the minimum sample
or appear in both splits. Both lexical and full prefix-composition precision
must reach the unchanged 98% threshold over at least 100 accepted form groups
per split. The validation labels are existing manual overrides, not a newly
commissioned independent image review. Neither split trains the source index.

Results: development accepts 14 groups (12 lexical and composite matches);
validation accepts 20 groups (12 lexical matches, 10 composite matches). Both
gates fail. Exact pointed attestations cover only 21 unresolved tokens; two also
have unique analyses and same-verse support. No mappings from this independent
attestation experiment are applied. The full regression evidence is retained in `attested_morphology.json`, including noun/verb
label disagreements and incorrect prefix composition. These disagreements must
be adjudicated, not silently treated as equivalent Strong numbers to pass a gate.

This independently sourced method also cannot achieve the remaining 1,734-token
gain. Transcription review must accompany further morphology work: direct visual
inspection of the John 18:4 crop (`john/018_004_000216.png`) found extra OCR text
in the current transcription near the printed `יקרהו יצא`. No transcription
repair is applied by this experiment; it requires a complete pointed reading and
the existing image-hashed correction-ledger workflow. The report continues to
count 3,734 unresolved tokens in its isolated pre-API baseline and does not
claim independent completion of #127.


## Image-confirmed repair batch

Direct crop review corrected 2 Corinthians 11:27 and Revelation 17:3 using the
hashed correction ledger. This is not wholesale OCR replacement: the alternate
OCR disagreed with visible source words, including Revelation's `ארגמן` and
`וראיתי`. The two source verses were transcribed from the images. The first verse
falls from seven unresolved tokens to one, and the second from five to zero.
The image-repair baseline was 107,730 tokens with 104,007 mapped and **3,723
unresolved**; the final API-integrated output is summarized above.
The remaining `בִּשְׁקֵדוֹת` is deliberately unresolved pending lexical review.

Four contextual overrides retain detailed noun/weak-verb parses and correct
prefix composition: `ביגיעה` (Hb/H3018), `בקר` (Hb/H7120), `בעירום` (Hb/H5903),
and `ויוליכני` (Hc/H3212, hiphil plus 1cs object suffix). Whole-form lexical
mappings retain their actual attested-form evidence without inventing internal
inflections. Verse mappings link back to the source image hash and correction
ledger. The four corrections do not add four to the eleven-token coverage gain.

A full regeneration exposed unrelated drift in existing corpus inputs, including
an existing clitic regression (`לובה` incorrectly acquiring Hl/Hc/D0271). Those
broad outputs were discarded. `--reviewed-transcriptions-only` regenerates only
issue-127 image-reviewed verses, validates the published before/after text and
source image hashes, and preserves all other published mappings and their
unresolved evidence. This mode does not approve general corpus regeneration.

Reproduce this batch with:

```sh
python -m scripts.hutter.map_strongs --reviewed-transcriptions-only --write
bun run --cwd web generate-data
python -m scripts.hutter.verify_transcription
python -m scripts.hutter.map_strongs --reviewed-transcriptions-only --morphology
```

Two regeneration runs were byte-identical across all 27 mapping files and the
aggregate report. A structural comparison confirmed exactly the two reviewed
verses changed. Static/offline verification passed for all 25 ledger corrections.
The automatic morphology precision gate remains blocking; image-confirmed manual
repairs do not authorize unvalidated automatic morphology assignments.
