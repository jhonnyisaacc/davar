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
