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

## Definition coverage

`python -m scripts.delitzsch.definition_coverage write` regenerates
`reports/definition_coverage.json`, which reports definition coverage per
identifier separately from mapping coverage. `check` fails when that report is
stale, an identifier has no lexicon entry, or a missing English or Spanish
definition is not listed in `definition_gaps_baseline.json`. The baseline only
shrinks. Remove an identifier from it when its definition lands, and route a
gap caused by a wrong identity to #159.

## Disposition ledger (issue #159)

`reports/besorah_dispositions_v1.json.gz` gives each occurrence in the
`review_queue` of `reports/besorah_remediation_v1.json.gz` a family and a
disposition. Regenerate it with `python -m scripts.delitzsch review
dispositions`, and check that the committed copy is current with `--check`.
Reruns write identical bytes.

- Queue families come from the queue reasons: `prefix_metadata`,
  `lexical_plausibility`, and `prefix_metadata_and_lexical`. Legacy rows are
  in `legacy_assignment`.
- Dispositions are `benign`, `corrected`, `already_reviewed`, `unresolved`,
  `blocked`, and `superseded`. `superseded` is for the identity-less
  `legacy_assignment_review` rows (#365, below).
- Each record names its `rule`, `rule_version`, and `reviewer`, keeps the
  queued `before` state, and carries its `evidence`. An `already_reviewed`
  record copies the prior decision's status, action, Strong values, reason,
  and timestamp.

The rules in `scripts/delitzsch/review/dispositions.py` run in order, and the
first match decides. A queued occurrence with a prior review status is
`already_reviewed`. Everything else stays `unresolved` until a later rule
settles it. A prior review decided the Strong number, not the prefix metadata,
so a rule that settles prefixes (#364, #366) goes before
`prior_review_decision`. Other new rules go before `unadjudicated`. A changed
rule bumps its version.

### Root-letter prefixes (#366)

Some words tag a prefix whose letter is the first letter of the lemma, such as
`בָּחַר` (H977, `בחר`) tagged `Hb`. To correct them, run these commands in
order:

1. `python -m scripts.delitzsch review root-letter-prefixes` writes
   `batches/root_letter_prefixes.json`.
2. `python -m scripts.delitzsch review apply root_letter_prefixes.json` removes
   the false prefixes, refreshes the verse separators, and logs each decision.
3. `python -m scripts.delitzsch review dispositions` records each one as
   `corrected`, with the before and after prefixes.

A flag is corrected only when a prior review confirmed its Strong number and
the lemma's first two letters start the word at a tagged prefix letter. The
correction keeps the Strong number. Other flags stay `unresolved`, because the
prefix reading can be real when the Strong number was never reviewed (for
example `לָכֶם` mapped to H3922). `remediate check` reverts the `corrected`
records before it compares the corpus with the validated plan.

### Style-only prefixes (#364)

Most prefix-only flags are style differences. The word's prefixes are real, and
the `strong` string leaves out the prefix segment, as in `וּבְשֹׁמְרוֹן` (H8111)
with `Hc` and `Hb`. The `style_only_prefix` rule records such a flag as
`benign`, with the token consonants, the prefix letters, the lemma, and any
prior decision as evidence. It does not change a Strong number.

A flag is `benign` only when all of these are true:

- The word has at least one tagged prefix. A flag with no prefixes stays
  `unresolved`.
- The tagged prefix letters start the word, and the lemma's first two letters
  follow them.
- The lemma has at least three letters, and the rest of the word is at least
  as long as the lemma.
- No prior review marked the occurrence `skipped` or `needs_manual_review`.
- A tagged `Hd` has the shape of the article, by the rules below.
- When no prior review set the Strong number, the first three letters of the
  lemma follow the prefixes, and no longer lexicon lemma starts at a tagged
  prefix letter. For example, `בִּטְחוֹן` mapped to H2911 (`טחון`) stays
  `unresolved`, because `בטחון` (H986) reads the `ב` as a root letter.
  A lexicon lemma of the same length also counts when the assigned lemma has
  at least four letters, so `בִּלְעָדֵינוּ` mapped to H5722 (`עדינו`) stays
  `unresolved`, because `בלעדי` (H1107) reads the `ב` and `ל` as root letters.
  Three-letter overlaps across the prefix match by accident too often.

An unreviewed Strong number came from the same matcher that tagged the
prefixes, so it is weak evidence for them. A prior review of the Strong number
did not review the prefixes, so the `Hd` rules apply to every flag.

The data has no verb stem or morphology, so the `Hd` rules use the pointing.
A tagged `Hd` is the article only when all of these are true:

- No `Hb`, `Hl`, or `Hk` comes before it. The article's `ה` drops after those
  prepositions, so a written `ה` there belongs to the stem, as in `לְהַעֲלוֹתוֹ`.
- Its vowel and the next letter fit the article: patah with a dagesh in the
  next letter, patah before `ח` or `ה`, patah before `י` or `מ` with a sheva,
  qamets before `א`, `ע`, or `ר`, or segol before `ח`, `ע`, or `ה` with a
  qamets. Other shapes, such as `הֶעֱמִידוּ`, the hireq of `הִשְׁלִיכוּ`, or
  the tsere of `הֵבִינוּ`, are verb patterns.
- If the next letter has a sheva or hateph and no dagesh, the Strong number is
  not a root entry in the lexicon. This keeps hiphil forms such as
  `וְהַחֲזִיקוּ` (H2388) out.

These rules keep some real articles out of `benign`, such as `הָאֲבֵלִים`
(H56). A flag that a rule cannot settle stays `unresolved`.

Two-letter lemmas and short forms such as `לָכֶם` mapped to H3642 match by
accident too often, so they stay `unresolved`. The rule checks the prefix
against the assigned lemma. It does not prove that the Strong number is right,
because the original matcher chose that number after it removed the same
prefix letters.

Each `benign` record therefore has a `lexical_review` field:

- `reviewed`: a prior `applied` or `already_applied` decision set the current
  Strong number. That decision is in `evidence.prior_decision`.
- `pending`: no prior review decision set the Strong number. An example is
  `וּמַתַּי` (Acts 1:13) mapped to H4970.

`summary.benign_lexical_review` gives the counts, and the `dispositions`
command prints them. The lexical review for #368 covers every `unresolved`
record and every `benign` record whose `lexical_review` is `pending`.

### Identity-less legacy assignments (#365)

The ledger also gives each row of `legacy_assignment_review` in the
remediation report a record in the `legacy_assignment` family. These rows come
from `parsed/strongs/v2` and lost their verse number. The remediation plan
lists the current locations with the same book, chapter, word index, and
pointed text in `matching_locations`. A legacy record has `source` set to
`legacy_assignment_review`, its position in that list as `row`, and no
`location`, because the row has no verse identity. Its `before` keeps the
row's book, chapter, word index, text, candidate, and outcome.

These rules run in order, and the first match decides:

1. `legacy_without_candidate`: a `failed` or `skipped` row has no candidate,
   so it is `superseded`.
2. `legacy_current_value`: the row matches exactly one location, the word
   there has the same pointed text, and its current Strong number equals the
   candidate. The row is `superseded` by that value. `after` names the
   location and the Strong number, and `evidence.current` gives the word and
   the status of its last review decision.
3. `legacy_blocked`: every other row is `blocked`. `evidence.current` lists
   the current word at each matching location.

No rule writes to the corpus, so no legacy candidate is reapplied. A blocked
row stays blocked. The current value at its location stays in the review
queue when a heuristic flags it. `summary.by_rule` gives the count per rule.
