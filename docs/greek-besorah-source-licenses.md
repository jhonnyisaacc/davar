# Greek Besorah — source licenses, TAGNT edition selection, and corpus coverage

Authoritative report for [#161](https://github.com/jhonnyisaacc/davar/issues/161). Later importer and release issues must follow these decisions. Nestle-Aland permission is out of scope and is tracked in [milestone 7](https://github.com/jhonnyisaacc/davar/milestone/7).

Checked against official notices on 13 September 2026. Recheck URLs before each data release.

## Decision summary

| Role | Source | License | Davar use |
| --- | --- | --- | --- |
| Reading edition | SBL Greek New Testament (Holmes 2010) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) via [sblgnt.com/license](https://sblgnt.com/license/) | Displayed Greek text |
| Word tags, variants, lemmas | STEPBible TAGNT | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Token order, dStrong, morphology, edition markers |
| English lexicon baseline | STEPBible TBESG | CC BY 4.0 | Short meaning and fuller English definition |
| Spanish lexicon candidate | UBS Dictionary of the Greek New Testament, Spanish JSON | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Sense-mapped Spanish only where lemma and sense match |
| Hebrew lexicon | Translation of the TBESG English baseline | New Davar work, reviewed before approval | Modern Hebrew definitions |
| Critical NA28/NA29 text | Deutsche Bibelgesellschaft / INTF | All rights reserved unless licensed | Not used for this launch |

SBLGNT is the reading edition. STEPBible is the tagging and English-lexicon source. Do not present TAGNT as if it were NA28.

## STEPBible TAGNT and TBESG

### License and attribution

Official repository: [STEPBible/STEPBible-Data](https://github.com/STEPBible/STEPBible-Data). Repository and file headers state **CC BY 4.0**, created for [STEPBible.org](https://www.stepbible.org/) from work at Tyndale House, Cambridge.

Required practices from the official README and file headers:

- Credit “STEP Bible” with a link to `https://www.STEPBible.org`.
- Record modifications and keep that record available to later users.
- Prefer referring others to the official GitHub repository rather than becoming a second untracked distribution point.
- Send proposed corrections to STEPBible for verification.

Offline distribution of reformatted TAGNT/TBESG artifacts is allowed under CC BY 4.0 if attribution and modification records travel with the data.

Recorded official revision at verification time:

| Artifact | Location | Revision |
| --- | --- | --- |
| Repository HEAD | `STEPBible/STEPBible-Data` `master` | `ae39711d7843b2902d54993e432de9c12d6a4b9a` (2026-09-08) |
| TAGNT Matthew–John | `Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt` | blob `705c1bc1cf752e013efcef99b8d9a3b7853bf843` |
| TAGNT Acts–Revelation | `Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt` | blob `4bbea2c14681b01eb889d5a2d1dc0856858a32de` |
| TBESG | `Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt` | blob `efe271a1dbb73fa01f8fa6e0f164c6687757a9ae` |

Introduction cited by the files: `TinyURL.com/TAGNT-Intro`. Spreadsheet: [TAGNT sheet](https://docs.google.com/spreadsheets/d/1Uri4ehqXnzUa97uvH-1-C022708HhLQ1a541Hsnlt70/edit).

### Columns we will use

Official header field names:

| Field | Use |
| --- | --- |
| Word & Type | Verse identity, token index, N/K/O class. Not the SBL selector. |
| Greek | Displayed spelling plus parenthetical English transliteration. Default spelling is NA28 when that edition has the word. |
| dStrongs = Grammar | Disambiguated Strong’s (`G0976`, `G2424G`) and morphology. Preserve as-is. Normalize only lookup keys. |
| Dictionary form = Gloss | Lemma and English gloss aligned with TBESG. |
| editions | **SBL selector.** Token `SBL` means Holmes 2010. |
| Spelling variants | Edition-specific spellings, including SBL when it differs from the main Greek cell. |
| sStrong+Instance | Undecorated Strong’s plus `_A` / `_B` instance marks. |

Do not use TAGNT’s English or Spanish translation columns as Davar lexical definitions. The English column is adapted from the Berean Study Bible with permission to STEPBible, not a license to Davar. The Spanish column is from the Marvel / OpenGNT project. Definitions come from TBESG and, where mapped, UBS.

## SBLGNT edition selection

### Why NKO is not enough

TAGNT Word-Type abbreviations from the official header:

- **N** — Nestlé-Aland (NA27 expressed in NA28 spelling)
- **K** — Textus Receptus / KJV tradition (Scrivener 1894)
- **O** — other major editions, including SBL, THGNT, Byz, WH, Treg
- Brackets mark a variant. Lowercase marks a difference too small to force a different translation.

`NKO` means the vocabulary is shared across those classes. It does not mean every listed edition spells or even includes the token the same way. SBL is an **O** edition in that scheme and is named explicitly in the Editions field as `SBL= Holmes 2010`.

### Required selector

Include a token in the displayed SBLGNT reading only when the Editions field contains the token `SBL` after splitting on `+` / `;` and stripping displacement notes (`»n`, `«ref`).

Examples from the official files:

| Official row | Editions | In displayed SBLGNT? |
| --- | --- | --- |
| `Mat.1.1#01=NKO` Βίβλος | `NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz` | Yes |
| `Mat.8.18#05=KO` πολλοὺς | `Tyn+SBL+Treg+TR+Byz` | Yes. Do not add the NA alternative. |
| `Mat.8.18#06=N(k)O` ὄχλον | `NA28+NA27+WH` | No |
| `Mrk.11.31#06=O` τί | `SBL` | Yes |
| `Mat.1.25#08=k` τὸν | `TR+Byz` | No |
| `Mat.17.21#01=KO` Τοῦτο | `Treg+TR+Byz` | No. The whole verse is absent. |
| `Rom.16.24#01=KO` Ἡ | `SBL+TR+Byz` | Yes. NA28 does not have this verse. |
| `Rom.16.25{14.24}#01=NKO` Τῷ | `NA28+NA27+Tyn+WH+Treg+TR+Byz«14.24` | No SBL token. Keep the TAGNT identity; do not shift it to 14.24. |

Never concatenate `πολλοὺς` and `ὄχλον` at Matthew 8:18. Those are alternative readings.

### Spelling, accents, and punctuation

Official TAGNT header:

- Spelling in the Greek cell comes from NA28 when that edition has the word, otherwise from TR or the other edition that has it.
- Cases and final accents follow punctuation based on THGNT.
- Edition-specific spellings are listed in Spelling variants.

Importer rule for [#162](https://github.com/jhonnyisaacc/davar/issues/162):

1. Keep the token only if Editions includes `SBL`.
2. If Spelling variants names `SBL`, use that spelling.
3. Otherwise use the main Greek cell, preserving accents and punctuation characters.
4. Preserve token order from the file. Do not rebuild order from NKO classes.
5. Preserve dStrong letters (`G2424G`) and instance marks. Normalize only derived lookup keys.

This means displayed punctuation follows TAGNT’s THGNT-based punctuation, not a separate SBLGNT punctuation file. Record that in every artifact’s modification log.

### Reconstruction limits that the importer must still prove

Selecting `SBL` from TAGNT yields SBL-tagged tokens in all 27 Besorah books. It is not automatically a byte-for-byte reprint of the printed SBLGNT, because:

- TAGNT default spelling is NA28 for shared words unless a Spelling-variant line names SBL.
- TAGNT punctuation follows THGNT conventions.
- Some printed SBLGNT double-bracketed passages (Mark 16:9–20, John 7:53–8:11) have **no** `SBL` token in TAGNT. Treat them as absent in the TAGNT-SBL reading unless [#162](https://github.com/jhonnyisaacc/davar/issues/162) later proves an official SBL spelling/presence from a licensed SBLGNT source and records that as a documented modification.
- Romans 16:25–27 is stored as `Rom.16.25{14.24}` without an `SBL` token. Do not relocate those rows to 14:24 for SBLGNT.

[#162](https://github.com/jhonnyisaacc/davar/issues/162) must compare the selected token sequence to official SBLGNT and record remaining differences. This issue forbids concatenating alternatives; it does not claim the TAGNT `SBL` column is already a complete printed-SBLGNT dump.

## Corpus coverage

TAGNT book codes match the STEPBible README NT list and map to Davar Besorah IDs in `scripts/greek/books.py`.

Verified against TAGNT Mat-Jhn + Act-Rev at the revision above: every one of the 27 books has both amalgamated rows and at least one `SBL` token.

| TAGNT | Davar | SBL tokens (this revision) |
| --- | --- | ---: |
| Mat | matthew | 18297 |
| Mrk | mark | 11091 |
| Luk | luke | 19408 |
| Jhn | john | 15409 |
| Act | acts | 18371 |
| Rom | romans | 7046 |
| 1Co | corinthians1 | 6792 |
| 2Co | corinthians2 | 4467 |
| Gal | galatians | 2224 |
| Eph | ephesians | 2411 |
| Php | philippians | 1624 |
| Col | colossians | 1576 |
| 1Th | thessalonians1 | 1470 |
| 2Th | thessalonians2 | 818 |
| 1Ti | timothy1 | 1590 |
| 2Ti | timothy2 | 1232 |
| Tit | titus | 657 |
| Phm | philemon | 334 |
| Heb | hebrews | 4928 |
| Jas | james | 1736 |
| 1Pe | peter1 | 1678 |
| 2Pe | peter2 | 1096 |
| 1Jn | john1 | 2133 |
| 2Jn | john2 | 244 |
| 3Jn | john3 | 219 |
| Jud | jude | 454 |
| Rev | revelation | 9816 |

Verses that have TAGNT rows but **zero** `SBL` tokens at this revision (do not fill from Hebrew or from NA28):

- Matthew 17:21; 18:11; 23:14
- Mark 7:16; 9:44; 9:46; 11:26; 15:28; 16:9–16; 16:18–20
- Luke 17:36; 23:17
- John 5:4; 7:53{8.1}; 8:1–11
- Acts 8:37; 15:34; 24:7; 28:29
- Romans 16:25{14.24}; 16:26{14.25}; 16:27{14.26}

Keep book/chapter/verse identity stable. A missing Greek verse is unavailable in this edition, not a hole to patch with Delitzsch or Hutter.

## SBLGNT license

The SBL Greek New Testament is licensed under CC BY 4.0. Copyright is held by the Society of Biblical Literature and Logos Bible Software. Attribution and a license notice are required when the text is shared, including in the app and in offline bundles. See [sblgnt.com](https://sblgnt.com/) and [sblgnt.com/license](https://sblgnt.com/license/).

TAGNT’s CC BY 4.0 license covers STEPBible’s tagging and amalgamated encoding. It does not replace SBL/Logos attribution for the SBLGNT reading.

## TBESG definitions

TBESG is the Translators Brief lexicon of Extended Strongs for Greek, CC BY 4.0. It is based on corrected Abbott-Smith, with other brief definitions where Abbott-Smith is missing. It is backward-compatible with original Strong’s and uses STEPBible disambiguated Strong’s (`dStrong`) when a name or sense is split.

Use TBESG as the English baseline. Keep the short gloss distinct from the fuller meaning field. Store one record per lexical entry and sense, with source revision and review status.

## UBS Greek dictionary (Spanish)

Official product: [UBS Dictionary of the Greek New Testament](https://translation.bible/tools-resources/ubs-dictionary-of-the-greek-new-testament/). Files: [ubsicap/ubs-open-license](https://github.com/ubsicap/ubs-open-license). SPDX license on that repository: **CC-BY-SA-4.0**.

Verified files:

- English: `dictionaries/greek/JSON/UBSGreekNTDic-v1.1-en.JSON`
- Spanish: `dictionaries/greek/JSON/UBSGreekNTDic-v1.0-es.JSON` (no v1.1 Spanish file at repository HEAD `3a6edd8212df2e1189037ad39687726990c80d56`, 2026-07-09)
- Lexical domains include a Spanish file at v1.0

Adaptations of UBS material, including translations and reformatting, must remain CC BY-SA 4.0 and credit United Bible Societies. Do not assume a matching Strong’s number or identical lemma spelling is the same sense. Unmapped Spanish entries are translated from the TBESG English baseline and stay `draft` until a reviewer approves them.

## What this issue does not authorize

- Importing or displaying Nestle-Aland as a reading edition
- Using TAGNT English/Spanish columns as Davar dictionary text
- Treating AI drafts as reviewed translations
- Enabling the public Evangelio setting
- Shipping Greek bundles

## Verification performed

- Re-read STEPBible-Data README, TAGNT file headers, TBESG file headers, SBLGNT license page, and UBS open-license repository metadata.
- Walked Matthew 8:18 as a verse with alternative TAGNT readings and confirmed a single SBL token sequence (`πολλοὺς`, not `ὄχλον`).
- Counted `SBL` tokens in all 27 TAGNT NT books at the recorded revision.
- Listed verse identities with zero `SBL` tokens.
- Encoded the selector and book map in `scripts/greek/` with tests in `tests/test_greek_tagnt_edition.py`.
