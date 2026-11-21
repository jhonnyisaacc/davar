# Evidence alignment overlay 1.0.0

This contract adds translation evidence categories, alignment units and a source inventory on top of the biblical knowledge foundation (`../../v1`). It does not change the v1 schemas, the pilot output or any knowledge adapter. Every unit and evidence record points at a v1 record ID, so the foundation stays the only owner of text, tokens, lexical entries and notes.

The overlay covers the evidence inputs of the later pipeline only:

`source unit -> lexical evidence -> existing translation evidence -> commentary evidence -> candidate options -> structured decision -> review result`

A fixture declares `through_stage`. The Romans fixture stops at `commentary_evidence`. It selects no candidate, invokes no JEV, generates no translation text and makes no publication decision.

## Build and check

From the repository root:

```sh
python -m scripts.knowledge.alignment check
python -m scripts.knowledge.alignment build
python -m pytest -q tests/test_knowledge_alignment.py
```

`check` rebuilds the fixture in memory and fails unless the result is byte-identical to `data/knowledge/generated/evidence-romans-v1/evidence.json`. `build` rewrites only that file. Both run offline. The build calls the existing `build.artifacts()` with the Romans profile, so input pinning, digest checks and v1 validation are the foundation's own. Both commands also print a warning for each inventory path claim that the checkout no longer matches. See [Inventory](#inventory).

## Files

- `data/knowledge/evidence/romans-v1/profile.json`, `inputs.json` and `reference-mappings.json` form an ordinary v1 build profile for Romans 1:16-17 and Habakkuk 2:4.
- `data/knowledge/evidence/romans-v1/authored.json` is the only hand-written overlay data. It holds the role registry, the phrase unit specs, the alignments and the non-available inventory rows.
- `tests/fixtures/knowledge/shaul/content/besorah/romanos_1_evangelio_justicia_responsabilidad_humana.md` is the public canonical Shaul note on Romans 1 at the pinned Shaul revision, byte-exact. Its comparison text is Delitzsch. It quotes no TTH text.
- `scripts/knowledge/alignment.py` derives, validates and traces the fixture.

## Evidence categories

| Category | Stage | Roles | Status |
| --- | --- | --- | --- |
| `SOURCE_TEXT` | source unit | `source_language_text` (SBLGNT Greek for the Besorah), `quoted_source_text` (OE Hebrew quoted in the Besorah) | imported |
| `LEXICAL_DATA` | lexical evidence | `lexicon_entry` (BDB words and roots, Greek lexicon), `custom_definition` | imported, authored, inferred |
| `EXISTING_TRANSLATION` | existing translation evidence | `baseline_reference_candidate` (TTH), `comparison_reference` (TS2009, BES), `hebrew_translation` (Delitzsch, Hutter) | imported |
| `ANCIENT_TEXTUAL_WITNESS` | existing translation evidence | `ancient_witness` (LXX) | imported |
| `COMMENTARY_TEACHING` | commentary evidence | `translator_note` (TTH footnotes by Natanael Doldan), `study_note` (Shaul notes, here on Eric's classes), `contextual_dictionary` (Eric's TCY entries), `transcript_segment` | imported, authored, inferred |
| `AI_GENERATED_CANDIDATE` | candidate options | `generated_candidate`; requires `context.generator` | generated |
| `HUMAN_REVIEWED_DECISION` | structured decision | `review_decision`; requires `context.reviewer` | reviewed_decision |

The schema binds each role to one category and lists the legal statuses of each category in one rule per category, the same table as above. `generated` is legal only for `AI_GENERATED_CANDIDATE`, and `reviewed_decision` only for `HUMAN_REVIEWED_DECISION`, so generated material and review decisions can never pass as authored or imported evidence. No record has an override, rank or supersedes field. Commentary sits beside lexical evidence in its own category and cannot replace it.

Delitzsch is a Hebrew translation of the Greek New Testament, so it is `EXISTING_TRANSLATION` with role `hebrew_translation`, even though Davar reads it as its Hebrew Besorah. Its Strong tags still give its tokens lexical units.

Category and role are never written per record. The generator looks them up in the role registry by source, v1 collection and v1 evidence kind. A v1 record without exactly one registry row fails the build, and validation rejects a record whose category or role differs from its registry row.

## Status

`status` says where a record came from. It is derived, never authored:

1. `reviewed_decision` when the category is `HUMAN_REVIEWED_DECISION`.
2. `generated` or `inferred` when the v1 `transformation` says so.
3. `authored` when the v1 `origin` is `authored`. Shaul notes are authored upstream by Shaul.
4. `imported` otherwise.

`review` is a separate field, copied from the v1 provenance: `unreviewed`, `approved` or `rejected`. A review state never changes `status` or category. An approved BDB entry stays `LEXICAL_DATA` with status `imported` and review `approved`, and a rejected one stays labeled as rejected rather than reviewed.

Alignments and authored inventory rows are Davar-authored editorial assertions in `authored.json`. Each carries `status: authored`, `review`, a provenance locator that points at its JSON pointer in `authored.json`, and that file's `version`. They stay `unreviewed` until a named reviewer approves them.

## Units

| Level | ID | Members |
| --- | --- | --- |
| `verse` | `unit:verse:<edition>:<book>:<chapter>:<label>` | one v1 passage |
| `token` | `unit:<v1 token id>` | one v1 token, with `lexical_unit_ids` and `verse_unit_id` |
| `phrase` | `unit:phrase:<v1 passage id>:<ordinals>` | two or more v1 tokens of one passage, in listed order, so a phrase may be discontinuous |
| `lexical_concept` | `unit:lexical:<namespace>:<code>` | one external lexical reference |

Token and verse units are derived for every selected passage. Phrase units come from authored specs whose `expected_texts` must equal the v1 token texts, so a source text change fails the build. A spec with one ordinal resolves to the derived token unit. Lexical units are derived from the tokens' own Strong or custom tags.

## Alignments

An alignment links a non-empty `source` unit list to a non-empty `target` unit list. `granularity` is `token` when every endpoint is a token or phrase unit and `verse` when every endpoint is a verse unit. Mixed endpoints are rejected. `counts` are tokens per side for token granularity and units per side for verse granularity. `shape` (`one_to_one`, `one_to_many`, `many_to_one`, `many_to_many`) is derived from `counts`, and validation rejects a stored shape that disagrees. `relation` is `translation_correspondence` or `quotation_of`. TTH is untokenized, so it aligns only at verse level.

## Evidence records

Each evidence record carries:

- `record`, the v1 collection and record ID it projects.
- `version`, the source ID, repository, revision, path and SHA-256 of the pinned input.
- `context`, the registry context plus the exact locator and, for passages, edition, language and canonical references. Shaul notes add `teaching_source_ids` from the note frontmatter and `transcript_segment: null`, because no timestamped segment exists.
- `status` and `review`, described in [Status](#status).
- `provenance`, copied byte-for-byte from the v1 record.

## Inventory

`inventory` lists every source the fixture knows about:

Each row has an `availability`:

- `available` rows are generated, one per pinned source with evidence, with the categories and evidence count it supplies.
- `missing_connector`, `not_available`, `deferred` and `excluded` rows are authored with a reason and carry the authored provenance described in [Status](#status). `paths` names where the data lives in the checkout, and `absent_paths` names where it would live.
- `gap` rows are generated, one per token lexical reference with no lexical entry. The build fails when the code exists in a selected lexicon, so an omission cannot pass as a gap. A gap names the connector-less data that holds the code, through the `covers` field of an inventory row.

A pinned source with no evidence needs an inventory row that `covers` it. No inventory row creates an evidence record.

The build never reads `paths` or `absent_paths`. Most of them sit outside the CI path filter of the knowledge job, so a build that asserted them would let a change elsewhere, such as adding an Eric file for Romans, break the next knowledge run on `main`. `alignment.drift(value, root)` compares the claims with a checkout when it is called, and `build` and `check` print each difference as a warning. A warning means an authored row needs an update.

## Trace

`alignment.trace(value, unit_id)` walks from a unit to its tokens, lexical units, phrases, verses and alignment partners. It returns the reachable evidence and inventory rows grouped by category in stage order. From the Greek Romans 1:17 verse it reaches the Greek and Habakkuk source text, the lexical entries, Delitzsch and TTH, the missing LXX witness, the TTH footnote and the Shaul note sections.

## Romans fixture inventory

Available: SBLGNT Greek Romans 1, Delitzsch Romans 1, TTH Romanos, OE Habakkuk 2, the BDB word and root lexicons, the Greek lexicon, and the canonical public Shaul note on Romans 1 (three sections on 1:16-17).

Missing connectors: TS2009 (licensed, served from Supabase Storage, never committed), BES Spanish, Hutter 1599 Hebrew, Davar custom definitions including Eric's `tcysite-eric` entries, and the Hebrew prefix particles.

Not available: LXX (no dataset in Davar or Shaul, though Romans 1:17 quotes Habakkuk 2:4) and an Eric TCY file for Romans.

Deferred or excluded: the other 42 public Shaul Romans notes (one of them, on 1:16-17, quotes TTH text), the Shaul emunah concept (no verified Strong mapping), the contextual relationship catalog (no Romans 1:16-17 record), and Shaul class transcripts (private, never read).
