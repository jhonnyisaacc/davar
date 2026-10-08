# 0001 — Pin current scripture loader output

## Context

Section 4a locks scripture behavior before the book-map dedupe. The web verse loader and the mobile chapter loader already return different shapes for the same chapter.

## Decision

Pin Psalms 117 from the repository `data/` files, Hebrew only.

- Web: `getVerse("psalms", 117, 1, { hebrewOnly: true })`.
- Mobile: `fetchChapterVerses("psalms", 117, { hebrewOnly: true })`.

The assertions keep today's values. Web word positions start at 0. Mobile word positions start at 1. The H3068 word has no transliteration. The mobile chapter still includes `translation: ""`. Path strings from `shared/staticDataPaths.ts` and the Bani result for `מִקְוֶה` / H4723 are pinned in the same change. This change does not dedupe the book map.

## Alternatives

- Pin a generated `web/public/data` payload. That tree is not in this checkout.
- Pin an English TS2009 verse. Those files are not in this checkout, so the loader returns an empty translation for a different reason.
- Correct the position base or the divine-name transliteration here. That is a behavior change and belongs in a later PR.

## Evidence

The pin tests call the current loaders. Web reads `data/oe/psalms/117.json` and `data/translit/psalms.json`. Mobile reads the same files through `fetchChapterVerses`. The Bani pin calls `Transliterator.transliterate_word("מִקְוֶה", "H4723")` and gets `miqveh`, guide `MIQveh`, stress syllable 1.

## How to undo

Delete the pin tests and this record in a behavior-change PR that updates the assertions and says why.

## Status

Accepted.
