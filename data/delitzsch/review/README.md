# Delitzsch Strong review policy

The parsed Delitzsch text is the primary source. Review decisions must preserve
the printed token and record their provenance in `decisions/*.jsonl`.

## Grammar-only forms

Inseparable preposition or particle forms with pronominal suffixes may use a
custom `D####` entry when a single Hebrew Strong number cannot represent the
whole printed token. Reuse one custom entry for every occurrence of the same
normalized grammatical form and retain each occurrence in `nt_instances`.

Issue #119 establishes entries for `בו`, `לי`, `לו`, `בי`, `עמך`, `אותן`, and
`ובעדך`, following the existing `D0208`/`D0209` precedent. It also assigns
`D0271` to feminine `בה`. A token remains
`needs_manual_review` when its morphology or transcription is uncertain; the
current examples are `בּוֹכִיּוֹת` and the damaged token `WO`.

## Proper-name flags

`possible_proper_name` is only retained when the token is genuinely a name.
Issue #119 corrected false name/place matches for ordinary forms including
`קורא`, `לחם`, `בעל`, `ישוב`, `ישנה`, `גדר`, `לבנה`, and `מלח`. Genuine names
retain their existing Strong entries and receive bilingual definitions. The
review must update prefixes and the display-text separators when an initial
letter previously misclassified as a prefix is actually part of the lexeme.

## Scan and report status

`review scan` and `review report` distinguish current scan flags as follows:

- `unreviewed`: actionable and eligible for a generated review batch;
- `reviewed_manual`: intentionally deferred by a `needs_manual_review` decision;
- `reviewed_skipped`: reviewed and intentionally retained;
- `reviewed_resolved`: an applied decision still visible to a heuristic scan.

`remaining_issues` contains only `unreviewed` flags. `reviewed_issues` preserves
the non-actionable counts, and `scan_flags` reports the raw heuristic total.
Batch generation excludes reviewed flags so completed work is not reviewed
again.

## Disposition ledger (issue #159)

`reports/besorah_dispositions_v1.json.gz` gives each occurrence in the
`review_queue` of `reports/besorah_remediation_v1.json.gz` a family and a
disposition. Regenerate it with `python -m scripts.delitzsch review
dispositions`, and check that the committed copy is current with `--check`.
Reruns write identical bytes.

- Families come from the queue reasons: `prefix_metadata`,
  `lexical_plausibility`, and `prefix_metadata_and_lexical`.
- Dispositions are `benign`, `corrected`, `already_reviewed`, `unresolved`,
  `blocked`, and `superseded`. `superseded` is for the identity-less
  `legacy_assignment_review` rows.
- Each record names its `rule`, `rule_version`, and `reviewer`, keeps the
  queued `before` state, and carries its `evidence`. An `already_reviewed`
  record copies the prior decision's status, action, Strong values, reason,
  and timestamp.

The rules in `scripts/delitzsch/review/dispositions.py` run in order, and the
first match decides. A queued occurrence with a prior review status is
`already_reviewed`. Everything else stays `unresolved` until a later rule
settles it. A new rule goes before `unadjudicated`. A changed rule bumps its
version.
