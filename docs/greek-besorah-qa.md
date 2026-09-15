# Greek Besorah launch QA

Release: SBLGNT 2011 + STEPBible TAGNT/TBESG revision
`ae39711d7843b2902d54993e432de9c12d6a4b9a`.

The feature is available on preview builds only. Production enablement fails
closed until all checks below are represented by a passing machine-readable QA
report and named human approvals for Spanish and Hebrew definitions.

## Automated release checks

- all 27 Besorah books and every indexed chapter are present;
- each chapter has the expected edition/revision identity and checksum;
- only displayed SBL readings are included;
- Strong identifiers and occurrence links use the `G` namespace;
- all displayed Strong identifiers have a lexicon entry;
- incomplete candidates cannot replace an active release;
- mobile downloads stage and validate before activation and retain the prior
  revision for rollback;
- web and mobile caches include source language, edition, and revision.

## Manual preview matrix

Record each result in `data/greek/qa-report.json` on the private release branch.
Every case must have `status: "passed"` before production can build.

- Web, narrow and wide viewports: Hebrew/Greek switching and persistence.
- iOS and Android: Hebrew/Greek switching, restart persistence, and offline
  restart.
- English, Spanish, and Hebrew UI locales: form and lemma transliteration,
  short meaning, full definition, and occurrence navigation.
- Single-verse and full-chapter modes: left-to-right Greek order and
  right-to-left Hebrew order.
- Translation visibility: the existing selected translation remains unchanged
  when the original-language source changes.
- SBL-absent verses: explicit unavailable state, without borrowing text from
  another edition.
- Offline update failure: the active revision remains readable.
- Rollback: the prior complete revision can be restored.

## Production gate

`python -m scripts.greek public-gate` requires:

1. complete approved English, Spanish, and Hebrew definitions;
2. named reviewer approval records for Spanish and Hebrew;
3. a revision-matched QA report in which every case passed.

No public enablement file is committed on this branch because Spanish and Hebrew
review is still pending.
