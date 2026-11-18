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

## Reviewers and approval (issue #386)

A review decision counts as an approval when its `reviewer` names a person or
an agent. Jhonny decided this in #386: an agent review is an approval, provided
the decision records which agent reviewed it, so a later human pass can find
every agent decision by its `reviewer` value.

- A person reviewer is a GitHub login, such as `jhonnyisaacc`.
- An agent reviewer names the agent, such as `codex-desktop`,
  `codex-delitzsch-review`, or `claude-delitzsch-review`.
- A `rule:` reviewer, such as `rule:style_only_prefix_v5`, is a deterministic
  rule, not a review. It never confirms a Strong number or approves an entry on
  its own.

The same rule applies to custom entry publication (#369): an applied decision
that names an agent reviewer approves the definitions it covers. A decision
with no reviewer approves nothing.

## Definition coverage

`python -m scripts.delitzsch.definition_coverage write` regenerates
`reports/definition_coverage.json`, which reports definition coverage per
identifier separately from mapping coverage. `check` fails when that report is
stale, an identifier has no lexicon entry, or a missing English or Spanish
definition is not listed in `definition_gaps_baseline.json`. The baseline only
shrinks, and #42 emptied it: every identifier the corpus references has an
English and a Spanish definition. A new gap fails the check. Add the
definition, or fix a wrong identity with a lexical review.

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

### Reviewed Strong corrections (#379)

A reviewer can correct a wrong Strong number with a `set_strong` decision
whose `issue_type` is `strong_correction`. The decision keeps the prefixes,
and its `evidence` gives the `lexicon`, `grammar`, and `context` reasons.
`batches/strong_corrections_379.json` corrects Mark 13:19 `הַבְּרִיאָה` from
H1277 to H1278 and Revelation 21:2 `כַכַּלָּה` from H5369 to H3618. Apply it
with `review apply`, then run `review dispositions`.

The `reviewed_strong_correction` rule records such a decision as `corrected`,
with the before and after Strong numbers. The ledger raises an error when the
decision is not an `applied` or `already_applied` `set_strong` by a person or
agent reviewer, when its previous Strong number differs from the queued one,
when the new Strong number repeats the old one or tags other prefixes, or when
an evidence field is missing.

A `strong_correction` decision for an occurrence outside the review queue gets
a record with `source` set to `decision_log` and the `outside_queue` family.
Mark 13:19 is such an occurrence. The queue flags only a missing Strong
number, a Strong string whose prefixes differ from the prefix metadata, or a
word that shares at most one letter with its lemma. `Hd/H1277` agrees with
`Hd` and shares four letters with `בריא`, so no queue rule saw it.
`remediate check` reverts the Strong number and the prefixes of each
`corrected` record, so any other edit to the corpus still fails the check.

### Root-letter prefixes outside the queue (#380)

Some words outside the review queue tag a root letter as a prefix and build
it into the Strong string as well, such as `בָּחַרְתָּ` stored as `Hb/H977`.
The queue never flags them, because the Strong string and the prefixes agree.
`review root-letter-prefixes` also scans every word outside the queue and
writes `batches/root_letter_prefixes_outside_queue.json`. Its `decisions`
remove the false prefixes from both the prefix list and the Strong string, so
`Hb/H977` becomes `H977`. Its `unresolved` list gives every other match with
its token, Strong string, prefixes, lemma, and reason. Apply the batch with
`review apply root_letter_prefixes_outside_queue.json`, then run
`review dispositions`.

A match is corrected only when one of these is true:

- `reviewed_strong`: the latest review decision before the correction,
  `applied`, `already_applied`, or `skipped`, kept the same Strong number.
  The #366 rule then decides the prefixes.
- `lemma_check`: no review decision exists, the lemma has at least three
  letters, the whole lemma follows the real prefixes, and a removed `Hd` does
  not have the article's shape. Also, no stem that follows a removed prefix is
  a lexicon lemma or starts with a lemma of three or more letters. The scan
  checks the stem after each removed prefix, so `לְבָנִים` tagged `Hl/Hb`
  stays unresolved, because `בָּנִים` after `לְ` reads as sons.

Every other match stays as tagged. The reasons are `manual_review` (a
`needs_manual_review` decision), `short_lemma`, `lemma_not_in_word`,
`prefix_reading` (such as `בְּאֵשׁ` mapped to H888, which reads as `בְּ` and
`אֵשׁ`, fire), and `article_shape` (such as `וְהַנֶּהֱנִים`). The
`root_letter_prefix_outside_queue` rule recomputes the match from the
decision's occurrence and raises an error when the decision does not agree
with it. Each correction gets a ledger record with `source` set to
`decision_log` in the `outside_queue` family. A later review decision that
keeps the Strong number of an unresolved match lets a rerun of the scan
correct it.

When the rule changes and no longer finds an applied correction certain, the
scan adds a `root_letter_prefix_withdrawn` decision to the batch. The decision
restores the original Strong string and prefixes. Apply it with
`review apply`. A withdrawn correction gets no ledger record, because the
word again matches the validated plan, and the scan lists the word as
unresolved. A withdrawal never counts as a review of the Strong number.

### Lexical review (#368, #367)

`batches/lexical_review_368.json` gives every occurrence that no earlier rule
settled a reviewed decision with `issue_type` set to `lexical_review`. The
batch covers the `unresolved` queue records, the `benign` records whose
`lexical_review` is `pending`, and the `unresolved` list of
`batches/root_letter_prefixes_outside_queue.json`. Each decision names its
reviewer and gives `lexicon`, `grammar`, and `context` evidence and a
`reason`. Its action is one of these:

- `skip` keeps the current Strong number. The record is `benign`, with
  `lexical_review` set to `reviewed`.
- `set_strong` corrects the Strong number, and `new_prefixes` corrects the
  prefixes when they are wrong. The Strong string carries the prefixes, so
  `לָכֶם` mapped to H5083 becomes `Hl/H859`. The record is `corrected`.
- `needs_manual_review` blocks the occurrence, for example a post-biblical
  word with no lexicon entry. The record is `blocked`, and `evidence.reason`
  says why.

`batches/lexical_review_367.json` reviews the same way every remaining
occurrence whose identifier has no English or Spanish definition (#367). A
blocked one kept its identifier until `definition_gaps_42.json` gave the word
an entry of its own.

Apply each batch with `review apply`, for example
`review apply lexical_review_368.json`. Then run
`review root-letter-prefixes`, apply its outside-queue batch, and run
`review dispositions`. A kept Strong number counts as a review, so the rerun
scan removes a false root-letter prefix, such as the `Hb` of `בֵּית` mapped to
H1004, and the ledger records it as `corrected` by the
`root_letter_prefix_outside_queue` rule.

`batches/lexical_review_368_followup.json` applies two conventions to the
whole corpus, after `lexical_review_368.json`:

- A preposition with a pronominal suffix uses the custom entry for its exact
  form, such as `לְךָ` on D0274 and `בִּי` on D0267. Without one, it uses the
  prefix and the independent pronoun, such as `בְּךָ` on `Hb/H859`. The
  exception is `בִּי אֲדֹנִי`, "I pray, my lord", which stays on H994.
  The entry follows the pointed form, not the person addressed. Pausal
  `לָךְ` and `בָּךְ` addressed to a man, as in Luke 4:7 and John 8:48, use
  D0275 and D0279, and `וָלָךְ` in Mark 1:24 uses `Hc/D0275`. A conjunctive
  dagesh does not change the entry, so `לָּךְ`, `לְּךָ`, `לִּי`, and `לּוֹ`
  use the entry of `לָךְ`, `לְךָ`, `לִי`, and `לוֹ`.
- A Hebrew word uses the Hebrew entry, not the Aramaic entry of Ezra and
  Daniel, such as `הָאִגְּרוֹת` on H107, not H104. An Aramaic entry stays when
  the lexicon has no Hebrew entry for the word, such as `שָׁלְטָן` (H7985), or
  in an Aramaic quotation, such as Mark 15:34.

Apply it with `review apply lexical_review_368_followup.json`, then run
`review dispositions`.

`batches/lexical_review_368_corrections.json` comes after the follow-up. It
corrects 26 words that neither batch reached. Four are verbs on H994, such
as `מָסַר` in Luke 23:25 (H994 to H4560). The other 22 are suffixed
prepositions on unrelated entries, most with a conjunctive dagesh, such as
`לָּךְ` in Luke 18:41 (H3922 to D0275) and `לּוֹ` in Acts 22:15 (H3575 to
D0266). It also rewords D0275 and D0279 to "second person singular
(feminine, or masculine in pause)" with `upsert_custom_definition`. Apply it
with `review apply lexical_review_368_corrections.json`, then run
`review dispositions`.

`batches/definition_gaps_42.json` resolves the occurrences that #367 and #368
blocked on identifiers with no English or Spanish definition (#42). Most were
names and post-biblical words with no entry of their own. The batch covers
every occurrence of the same words that was blocked or never reviewed, such as
Thessalonica on H2803 "think". An occurrence that an earlier review corrected
keeps that correction. The batch makes these changes:

- 42 `upsert_custom_definition` decisions create custom entries D0285 to
  D0326. Each entry has an English and a Spanish sense, a transliteration,
  `mapping_scope` set to `instances_only`, and the `nt_instances` it covers.
  Names include Thessalonica, Athens, Luke, and Alexander. Post-biblical words
  include שֵׁרוּת service, יְכֹלֶת ability, רְדִיפָה persecution, and the
  adjective יָתֵר. A derived word gets its own entry and is not mapped to its
  root.
- 6 more decisions give H1421, H1861, H4136, H5681, H6969, and H758 the
  English or Spanish they lacked. The first BDB gloss of each already fits its
  New Testament occurrences, or the entry has no BDB gloss.
- The Ephesian silversmith Demetrius gets D0700, and the city treasurer
  Erastus gets D0701, because D0076 and D0299 name other people.
- 148 `set_strong` lexical reviews move the occurrences to these entries, to
  D0282 (טַלְיְתָא), D0016 (the Alexandrian ships), and H3201 (Galatians 4:15).
  They also correct false prefix tags, such as the ל of לוּקָס. Each
  decision's `evidence.greek` names the SBLGNT word of the verse.

Apply it with `review apply definition_gaps_42.json`, then apply rounds 2 to 5
in order, run `review root-letter-prefixes`, and run `review dispositions`.

`batches/definition_gaps_42_round_2.json` resolves the 677 occurrences that
the lexical reviews blocked on an identifier that has a definition but names
a different word. `python -m scripts.delitzsch.review.blocked_candidates
<output>` lists each blocked occurrence with its verse, its SBLGNT content
words, the entries whose lemma is the token or a prefix-stripped stem, and
the identities that reviewed occurrences of the same stem use. The report
proposes nothing. A reviewer judged each word from the pointed form, the
verse, the Greek, and the lexicon. The batch makes these changes:

- 360 `upsert_custom_definition` decisions create entries between D0327 and
  D0698, with the same fields as the first batch. Names include Lydia,
  Cyprus, and Puteoli. Delitzsch follows the Textus Receptus order in Romans
  16:14, so `וְהֶרְמָס` is Hermas (D0645) and `וְהֶרְמִיס` is Hermes (D0338),
  the spelling of Acts 14:12. Post-biblical words include נִסָּיוֹן trial,
  מוֹכֵס tax collector, חֵרוּת freedom, and the verb הִשְׁתַּמֵּשׁ use. A
  derived word gets its own entry, so עֲבֵרָה transgression is not on
  עֲבָרָה, the place in John 1:28.
- A name borne by more than one person gets one entry per person, so each
  occurrence shows its own person first. D0338 is Hermes the god and D0702
  the Christian in Rome, D0354 Sosthenes the synagogue ruler and D0703 the
  co-sender of 1 Corinthians, D0573 Rufus the son of Simon and D0704 the
  Christian in Rome.
- A custom entry keeps its own gloss first. The reader ranks only the
  `custom` source above BDB, so a `delitzsch_review` sense on an H entry shows
  under More, after the BDB glosses. A sense goes on an H entry only for a
  meaning that the entry's first BDB gloss already fits. A New Testament
  person, a post-biblical sense, or a homograph gets a D entry of its own,
  such as D0333 Manaen (H4505 opens with "comforter"), D0534 Zechariah the
  father of John the Baptist (H2148 opens with the king of Israel), D0690
  כָּפַר deny (H3722 opens with "cover over"), and D0402 שִׁמֵּשׁ serve.
  סַנְהֶדְרִין goes to the existing D0008.
- D0705 Rome takes `רוֹמִי` where it names the city. D0141 keeps Roman.
- 685 `set_strong` lexical reviews move the occurrences. Some moves go to an existing entry for the same word, such as D0053
  הִסְכִּים, D0167 אֵבָר, D0326 כָּרַךְ, and H1278 for `הַבְּרִיָּה`. Each
  decision's `evidence.greek` names the SBLGNT word of the same verse. Where
  the SBLGNT has no such word, `evidence.greek_note` says why: a verse
  boundary that differs, as in Acts 24:3, a Textus Receptus reading, as in
  Matthew 5:47 and 1 Peter 3:8, or a free rendering.

`batches/definition_gaps_42_round_3.json` creates D0699 Melita and moves 206
more occurrences. Most are occurrences of the round's own words that sat on
another identifier, found by matching every inflected form of each reviewed
word across the corpus, such as Artemis, Bethphage, Bethsaida, the
publicans, Epaphroditus, Aeneas, Troas, Trophimus, Gennesaret, מִילָה
circumcision, and אֲמִתִּי true. Acts 28:1 `מְלִיטִי` moves from D0254
Miletus to D0699 and supersedes the #399 correction. A homograph stays where
it is, such as `וּמָתַי` when in Matthew 25:38 and `בַּגָּלוּי` openly.

`batches/definition_gaps_42_round_4.json` moves every New Testament
occurrence that the reader would open with another referent's gloss. It
creates D0706 to D0725 and moves 417 occurrences:

- The father of John the Baptist goes to D0534 in Luke 1 and Luke 3:2. The
  Zechariah killed between the sanctuary and the altar (Matthew 23:35, Luke
  11:51), whom Delitzsch names son of Jehoiada, gets D0706. The prophet of
  Matthew 27:9, whom Delitzsch names where the Greek has Jeremiah, gets D0707.
- New Testament names on an H entry whose first BDB gloss names another
  person get D entries: John (H3076 "a priest", 119), Simon and Simeon (H8095
  "second son of Jacob and Leah", 82), Mary (H4813 "sister of Moses", 54),
  Nathanael, Talmai in Bar-Talmai, Enoch, Hezron, Mattathias, Salome, Azor,
  Lamech, Gog, Midian, Semein, Joanan, and Zeus, which Delitzsch writes בֵּל.
  Revelation 7:7, the tribe of Simeon, stays on H8095. Annas goes to D0189.
- The same words wherever they occur: שִׁמֵּשׁ serve (D0402), לִמּוּד
  teaching (D0415), קָבַע fix (D0502), and כָּפַר deny (D0690). כָּפָר village
  moves from H3722 to H3723, and כַּפֹּרֶת mercy seat to H3727. Mark 7:3
  עַד־הַפֶּרֶק gets D0725, joint of the arm.
- Common words that sat on a name: שֶׁבַע seven on H884 Beersheba (28), אֵל
  God on H1008 Bethel (14), בַּעַל owner or husband on H4807 (25, the ב is a
  root letter), and 22 others, such as חָם hot on H2526 Ham (Revelation
  3:16).

`batches/definition_gaps_42_round_5.json` makes the reader's first gloss
right for every New Testament occurrence. The reader takes the first gloss
from `scripts/dict/reader_gloss.py`, which computes it the same way as
`shared/lexiconAssets.ts`. The batch creates D0726 to D0862 and moves 1467
occurrences:

- 91 name entries, one for each New Testament referent whose H entry opens
  with an etymology, another person, or a bare Old Testament name, such as
  David (H1732 "pot"), Galilee (H1551 "cylinder"), Abraham, Nazareth and
  Nazarene (H5342 "sprout"), Bethlehem, James (H3290 Jacob), Judas, and Judea
  (H3063 Judah). The English and the Spanish first gloss name the referent,
  and `evidence.greek` names the Greek name of the verse.
- 46 sense entries for New Testament senses that the H entry's first gloss
  does not give, such as different and change (H8138 "repeat", 1 Peter 1:6
  goes to different), marry a dead brother's widow (H2992, Mark 12:19),
  begin (H2490 "pollute"), fear (H3372), and God (H410, except the five
  לְאֵל יָד idioms of power). John 11:13 שֵׁנָה goes to H8142 sleep.
- 336 common words leave a name number, such as לֶחֶם bread on H1035
  Bethlehem and נָצַר keep on H5342.
- Romans 16:1 מְשַׁמֶּשֶׁת goes to D0402 serve. 13 Johns on H3110 go to D0708.
  D0141 Roman lists Acts 22:25, John 19:20, and Luke 23:38.
- 54 `upsert_custom_definition` decisions on H entries add a `custom` record,
  because the reader ranks only the `custom` source above BDB. 39 replace a
  reviewed `delitzsch_review` record whose BDB headline names another sense,
  such as H1961 "be; become; come to pass" for "fall out". 15 fix an entry
  whose English and Spanish first gloss came from different records, or
  whose BDB headline does not fit its New Testament use, such as H5800
  "leave" for "restore" and H7218 "head" for "Rôsh".

`tests/test_delitzsch_reader_glosses.py` checks that every New Testament
occurrence shows an English and a Spanish first gloss from one record, and
that every occurrence of a proper-noun H entry shows its name first.

A `set_strong` onto a custom entry whose `mapping_scope` is `instances_only`
adds the occurrence to that entry's `nt_instances`, and removes it from the
previous entry's list. Each such entry lists exactly the occurrences
reviewed onto it.

The `reviewed_strong_correction` rule (version 3) records a `set_strong`
lexical review. It raises an error when the decision has no person or agent
reviewer, when an evidence field or the reason is missing, when the previous Strong number
differs from the queued one, when nothing changes, or when the Strong string
does not carry the new prefixes. The `lexical_review` rule raises the same
error for a `skip` that changes the Strong number. A lexical review outside
the queue gets a record with `source` set to `decision_log`.

A later reviewed correction supersedes an earlier one. The ledger reads every
logged decision for the occurrence and links each applied correction to the
one before it, when the earlier correction's new Strong number is the later
one's previous Strong number. Decisions of other kinds between them do not
break the link. An outside-queue root-letter correction is also a link, so
reverting the ledger still restores the remediation corpus. The rule then
checks every link, the first link against the
queued Strong number, and that each link starts from the Strong number and
prefixes the previous link left. The record keeps the queued `before` state,
takes `after` from the latest correction, and lists the earlier links in
`evidence.superseded`. The old decision lines stay as they were logged.

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
