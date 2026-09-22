# Greek Besorah

Approved execution plan. Launch Greek Besorah on web and mobile using STEPBible TAGNT word data, with definitions and transliteration for English, Spanish, and Hebrew. Pursue NA28 licensing separately without blocking this release.

Created during execution on 13 September 2026.

## Tracking

| Milestone | URL |
| --- | --- |
| Greek Besorah — STEPBible launch | https://github.com/jhonnyisaacc/davar/milestone/6 |
| Greek Besorah — licensed Nestle-Aland | https://github.com/jhonnyisaacc/davar/milestone/7 |

Label: `greek-besorah`.

Close the STEPBible milestone only when the complete Greek experience ships publicly. Keep Nestle-Aland licensing and integration tracked in milestone 7. Launching Nestle-Aland is the completion criterion for that milestone, not for STEPBible launch.

## Decisions that later issues must not reopen

- Reading edition: SBLGNT (Holmes 2010). Tagging and English lexicon source: STEPBible TAGNT / TBESG.
- Select SBLGNT tokens from the TAGNT **Editions** field token `SBL`. Do not use N/K/O word-type as the selector. Do not concatenate alternative readings.
- Preserve Greek spelling, accents, punctuation, token order, lemmas, and disambiguated Strong’s identifiers. Normalize only lookup keys.
- English definitions: TBESG baseline. Spanish: UBS CC BY-SA 4.0 where lemma and sense mapping is verified; otherwise translate the English baseline. Hebrew: translate the English baseline into modern Hebrew.
- Short meaning and fuller definition stay distinct. A general dictionary gloss is not an occurrence-specific translation.
- AI drafts are not reviewed. Competent linguistic review is required before a language is marked approved. Reviewer availability is a release dependency.
- Hebrew transliteration defaults to **Hebrew letters** generated from Greek. Form and lemma transliterations are generated and labeled separately. No runtime AI transliteration.
- Shared persisted setting: `besorahLanguage: "hebrew" | "greek"`. Existing users default to Hebrew.
- Evangelio → Hebrew / Greek. Besorah Translation → Hutter / Delitzsch appears only for Hebrew and is restored when switching back. Move the New badge from Besorah Translation to Evangelio.
- Keep Greek behind a feature gate until [#169](https://github.com/jhonnyisaacc/davar/issues/169). Enable the public setting and New badge together.
- Namespace assets, caches, and SQLite bundles by edition and revision. Validate complete bundles before activation. Retain rollback.
- Nestle-Aland text is not imported until written permission and an authorized dataset exist. The publisher inquiry is drafted; sending it requires an explicit user instruction.

Authoritative license, edition-marker, and coverage report: `docs/greek-besorah-source-licenses.md`.

## STEPBible launch — ordered issues

Implement one issue at a time through focused PRs. First implementation branch and PR title: `feat/greek_besorah`. Later PRs use issue-specific names.

| Order | Issue | Depends on |
| ---: | --- | --- |
| 1 | [Verify source licenses, TAGNT edition selection, and corpus coverage](https://github.com/jhonnyisaacc/davar/issues/161) | — |
| 2 | [Build a reproducible Greek text and lexicon importer](https://github.com/jhonnyisaacc/davar/issues/162) | #161 |
| 3 | [Import and map multilingual definitions; prepare reviewed translations](https://github.com/jhonnyisaacc/davar/issues/163) | #162 |
| 4 | [Define and implement English, Spanish, and Hebrew transliteration](https://github.com/jhonnyisaacc/davar/issues/164) | #162 |
| 5 | [Add Greek data interfaces, loading, caching, and mobile offline storage](https://github.com/jhonnyisaacc/davar/issues/165) | #162 |
| 6 | [Add Hebrew/Greek settings and relocate the New badge](https://github.com/jhonnyisaacc/davar/issues/166) | #165 |
| 7 | [Implement Greek reading and clickable word details](https://github.com/jhonnyisaacc/davar/issues/167) | #163–#166 |
| 8 | [Add upstream update checks and validated data releases](https://github.com/jhonnyisaacc/davar/issues/168) | #162, #163, #165 |
| 9 | [Complete cross-platform QA and enable Greek publicly](https://github.com/jhonnyisaacc/davar/issues/169) | #167, #168 |

## Nestle-Aland — issues

| Issue | Depends on |
| --- | --- |
| [Obtain publisher permission and identify an authorized digital dataset](https://github.com/jhonnyisaacc/davar/issues/170) | — |
| [Import and validate licensed NA28 text and word mappings](https://github.com/jhonnyisaacc/davar/issues/171) | #170 |
| [Integrate the licensed edition, attribution, and permitted offline distribution](https://github.com/jhonnyisaacc/davar/issues/172) | #171 |
| [Support NA29 when authorized digital data becomes available](https://github.com/jhonnyisaacc/davar/issues/173) | #171, #172 |

## Sources, definitions, and transliteration

### Greek text and word mappings

- Import official TAGNT and TBESG, preserving licenses, attribution, source revisions, and modification records.
- Select the SBLGNT reading using the documented `SBL` edition token. Verify complete reconstruction in #162 against official SBLGNT. Do not concatenate alternative readings.
- Identify SBLGNT as the reading edition and STEPBible as the tagging source.
- Generate occurrence counts and navigable token references from the exact displayed edition.
- See `docs/greek-besorah-source-licenses.md` for reconstruction limits (THGNT punctuation, NA28 default spelling, double-bracketed passages without a TAGNT `SBL` token).

### Definitions

| Language | Source and preparation |
| --- | --- |
| English | Preserve STEPBible TBESG definitions as the baseline. |
| Spanish | Import the openly licensed UBS Greek dictionary (`UBSGreekNTDic-v1.0-es.JSON`) where lemma and sense mapping can be verified. Translate the English baseline for uncovered entries. |
| Hebrew | Translate the English baseline into modern Hebrew, checking the original Greek lemma and senses. |

- Match UBS entries using Greek lemmas and sense information.
- Retain source attribution per definition. Distribute adaptations of UBS material under CC BY-SA 4.0.
- Store translations once per lexical entry and sense, with source revision and review status. Reuse them across occurrences.
- Require approved English, Spanish, and Hebrew coverage for the displayed corpus before public release.

### Transliteration

- Use documented, deterministic Greek-to-script rules, with versioned exceptions and reviewed examples.
- Preserve STEPBible’s supplied transliteration for English where available.
- Generate Spanish transliteration directly from Greek using consistent Spanish reading conventions.
- Default Hebrew transliteration to Hebrew letters, generated directly from Greek.
- Distinguish the inflected word displayed in a verse from its dictionary lemma.
- Test vowel combinations, breathing marks, accents, consonant combinations, final sigma, and Unicode normalization.

## App behavior and updates

- Add **Evangelio → Hebrew / Greek**, localized in `locales/en.json`, `locales/es.json`, and `locales/he.json`.
- Show **Besorah Translation → Hutter / Delitzsch** immediately below it only for Hebrew.
- Move the **New** badge from `settings.besorahTextVersion` to Evangelio on mobile settings, web settings, and the web navigation dropdown. Keep `shared/settingsOrder.ts` as the single source of truth.
- Support all 27 Besorah books in verse, chapter, and Sefer views. Preserve navigation and existing translated-text behavior.
- Render Greek left-to-right with polytonic accents. Make source-only labels language-aware and disable Hebrew-specific controls for Greek.
- Reuse the word card and mobile bottom sheet for transliteration, localized meaning, Strong’s number, occurrence count, and clickable instances. Hide Hebrew root, prefix/preposition analysis, and Qumran sections.
- Extend reading and analysis interfaces with source language, edition, revision, language-neutral text, and localized lexical fields. Keep `G` and `H` Strong’s namespaces separate.
- Add weekly upstream checks. Flag changed definitions for translation review and changed transliteration rules for regeneration. Publish updates only after validation and review.

Primary files later issues will touch:

- Settings: `shared/settingsOrder.ts`, `web/src/app/components/SettingsScreen.tsx`, `web/src/app/components/NavigationBar.tsx`, `mobile/app/(tabs)/settings.tsx`, `web/src/app/utils/storageHelpers.ts`, `mobile/src/services/storage.ts`
- Loading: `web/src/app/services/staticData.ts`, `mobile/src/services/scripture.ts`, `mobile/src/services/offlineSync.ts`, `scripts/generate-static-data/`
- Reading: `web/src/app/components/VerseDisplay.tsx`, `web/src/app/components/WordCard.tsx`, `mobile/src/screens/VerseDetailContent.tsx`

## Verification and completion

Each issue runs its own acceptance and verification list. Across the launch:

- Validate corpus coverage, exact token reconstruction, edition selection, lexical mappings, trilingual definition coverage, transliteration, and occurrence indexes.
- Test preference persistence, Hebrew defaults, conditional settings, badge placement, and Hutter/Delitzsch restoration.
- Verify Greek and Hebrew-script direction, accents, word selection, and instance navigation on both platforms and all reading modes.
- Handle edition-specific absent verses without shifting references or substituting Hebrew text.
- Test offline loading, interrupted updates, cache isolation, language switches during loading, and rollback.
- Run relevant web/mobile checks and Hebrew regression tests for each issue.

## Publisher inquiry (do not send)

Draft for [#170](https://github.com/jhonnyisaacc/davar/issues/170). Sending requires an explicit user instruction after that issue exists.

```text
Subject: License inquiry — Nestle-Aland Greek New Testament in the Davar study app

Dear Permissions / Licensing Team,

I am writing to request permission to license an authorized digital edition of the Nestle-Aland Novum Testamentum Graece (currently NA28) for use in Davar (https://github.com/jhonnyisaacc/davar), a contemplative Bible study application for web and mobile (iOS and Android).

Davar already offers Hebrew Scriptures and a Hebrew New Testament (Besorah). We are adding a Greek Besorah reading mode. The initial public Greek text uses the SBL Greek New Testament, tagged with STEPBible TAGNT/TBESG data, under those projects’ published licenses. We want to offer Nestle-Aland as a distinct, clearly attributed edition when we have an authorized dataset and written permission.

We are asking about the following intended uses, all subject to your terms:

1. Display the NA28 Greek text, with accents and standard punctuation, one verse at a time and in chapter/scroll views.
2. Allow readers to tap words for lexical information (lemma, short meaning, fuller definition, Strong’s identifier, occurrence list). We would need an authorized word-level mapping if you provide or permit one.
3. Store the licensed text on-device for offline study in the mobile apps, and cache it for the web app, if offline/cache distribution is permitted.
4. Ship English, Spanish, and Hebrew interface languages. Definitions shown beside NA28 would come from separately licensed lexica, not from NA apparatus notes, unless you authorize apparatus use.
5. Name Nestle-Aland / Deutsche Bibelgesellschaft / INTF in the app’s attribution and sources screens in the form you require.

We would not:

- Redistribute the Nestle-Aland text as a standalone downloadable Bible outside the app, unless your license allows it.
- Present Nestle-Aland as SBLGNT or mix the two editions in a single verse.
- Use critical-apparatus content, punctuation decisions, or morphological tagging beyond what the authorized dataset and license cover.

Please let us know:

- Whether a digital NA28 dataset is available for this kind of app, and how to obtain it.
- Whether offline storage on user devices is permitted, and any encryption, user-count, or platform limits.
- Required attribution wording and placement.
- Fees, territory, term, and whether iOS, Android, and web can be covered together.
- Whether a future NA29 digital edition can be added under the same agreement or will need a new license.

Thank you for considering this request. I am happy to provide mockups, user counts, or a draft attribution screen.

Sincerely,
Jhonny Isaac
https://jhonny.work
```

## Execution status

| Deliverable | Status |
| --- | --- |
| Milestones and issues | Created (#161–#173) |
| `docs/plans/greek-besorah.md` | This file |
| #161 license and coverage report | Done in #174. Report: `docs/greek-besorah-source-licenses.md` |
| #162 reproducible importer | Implemented as `python -m scripts.greek` |
| #163 multilingual definitions | Implemented as `python -m scripts.greek define` |
| #164 transliteration | Implemented in `scripts/greek/transliteration.py` |
| #165 data interfaces, cache, offline | Implemented with revision-namespaced web/mobile loaders and staged SQLite activation |
| #166 Hebrew/Greek setting | Implemented on web/mobile with persisted, preview-gated selection and a New badge |
| #167 Greek reading + word details | Implemented on web/mobile with LTR source text, clickable words, translated text, and explicit absent-verse state |
| #168 upstream checks + validated releases | Implemented with scheduled source reports, complete-tree validation, staged activation, and rollback retention |
| #169 QA + public enablement | Preview is implemented; production remains fail-closed pending the documented QA matrix and named Spanish/Hebrew reviewer approvals |
| #170 inquiry sent | No. Waiting for an explicit send instruction. |
