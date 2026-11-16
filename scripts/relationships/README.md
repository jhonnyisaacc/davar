# Contextual relationship candidates

This script fills `shared/contextualRelationships.json` with Greek-Hebrew pairs that the TTH footnotes name. Every record it adds is unreviewed. The word card shows only approved records, so a new candidate stays hidden until a person approves it.

## Run it

From the repository root:

```sh
python3 -m scripts.relationships
python3 -m scripts.relationships --check
python3 -m pytest -q tests/test_relationship_candidates.py
```

The first command writes the outputs. `--check` writes nothing and exits 1 when an output differs from what the script produces. Running the script again on its own output changes nothing.

## Files

- `data/relationships/terms.json` maps each transliteration in a footnote to a Strong number. A person writes it. A term with no Strong number goes under `no_strong` with the reason. The script stops when a footnote names a term that is not in this file.
- `data/relationships/candidates.json` is generated. It lists every footnote with `Gr.:`, the terms it names, and a pre-check for each side of each pair.
- `shared/contextualRelationships.json` is the catalog. The script owns the records whose provenance is `tth` and `extracted`. It keeps the `review` of each one and passes every other record through unchanged.

A footnote names a Hebrew side only with a capital `Heb.:`. A lowercase `heb.` is a hedge or a quotation, as in `Posiblemente, heb.: Tzarébet`, so those footnotes count as Greek-only. A footnote gives one record per Hebrew term, scoped to the footnoted verse. A term whose Strong number has no lemma in the repo lexicon gets no record, because the word card could not show a gloss for it.

Each pre-check has a `status`:

- `found` means the Strong number tags a token at the cited verse. `tokens` lists those tokens.
- `absent` means no token at the verse carries the Strong number. The translation there may use another word.
- `unchecked` means the repo has no tagged text for that side. The Greek side of a Tanakh verse is always unchecked, because the repo has no LXX.
- `verse_missing` means the tagged text has no such verse.

The Greek side is checked against the TAGNT tagging in `data/greek/preview`. The Hebrew side is checked against Delitzsch (`data/delitzsch/parsed`) for the Besorah and against OSHB (`data/dict/books`) for the Tanakh.

## Review procedure

Jhonny, the repository owner, reviews candidates. He may name another person as reviewer in the pull request that records the decision. Only the reviewer decides. An agent may run the script and report the pre-checks, but it never approves or rejects a record on its own judgment. Anyone, an agent included, may record a decision that the reviewer stated. The commit that records it cites that decision: who made it, when, and which record ids it covers.

For each record, the reviewer checks three things:

1. The source says it. Open the footnote at `provenance.path` and `provenance.json_pointer`. It must name both terms as equivalents, and `rationale.es` must quote it verbatim.
2. The Strong numbers are right. Each side's Strong number and lemma must be the word the footnote means. Read the pre-check in `candidates.json`. When a side is `absent` or `unchecked`, decide from the lexicon and the verse.
3. The verse scope is right. The record covers the footnoted verse only. When `scope_hint` says the footnote applies to more verses, decide whether the record must cover them too.

To record the decision, replace the record's `review` in `shared/contextualRelationships.json`:

```json
{ "status": "approved", "reviewer": { "name": "Jhonny" }, "reviewed_on": "2026-11-16" }
```

Use `"rejected"` for a pair that fails a check. Then run `python3 -m scripts.relationships` and commit both files. The script keeps the decision when it runs again. It stops when a reviewed record no longer matches a footnote, so a changed source cannot silently drop a decision.
