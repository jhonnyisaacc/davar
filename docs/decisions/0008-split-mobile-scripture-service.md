# 0008 — Split the mobile scripture service

## Context

Section 4i. `mobile/src/services/scripture.ts` was one module: 1,596 lines on this base. The plan counted 1,665 before the shared path helpers moved. The module loaded a chapter from static JSON, fell back to SQLite, and fetched Greek Besorah. Callers import `fetchChapterVerses`, the Greek fetchers, and the display types from `@/src/services/scripture`.

## Decision

`scripture.ts` stays the public module and re-exports the same surface. The bodies move to siblings under `mobile/src/services/`:

- `scriptureDisplay.ts` holds `DisplayWord`, `DisplayVerse`, and the pure helpers both loaders share.
- `scriptureTs2009.ts` holds the TS2009 chapter JSON cache.
- `scriptureStaticLoad.ts` reads static JSON assets.
- `scriptureStatic.ts` maps those reads to `DisplayVerse[]`.
- `scriptureSqlite.ts` is the SQLite chapter loader. It still calls `database.ts`.
- `scriptureChapter.ts` exports `fetchChapterVerses`: static JSON first, SQLite when offline or when the static read fails.
- `scriptureGreek.ts` exports `isGreekBesorahEnabled`, `fetchGreekChapterVerses`, and `fetchGreekVerse`.

Import paths stay `@/src/services/scripture`. Greek calls `fetchChapterVerses` from `scriptureChapter.ts`, so the barrel does not import itself. The static translation loader still falls back to `fetchTranslationVerses` when the JSON map is empty. SQLite queries stay in `database.ts`.

## Alternatives

- Leave the file whole. The hotspot stays.
- Put the pieces in a `scripture/` directory with an `index.ts`. Callers would change, or `scripture.ts` and `scripture/` would sit side by side. Sibling files match the other modules in `mobile/src/services/`.
- Move the SQLite queries into the new loader. `database.ts` already owns them.
- Split `VerseDetailContent` or move component files in this PR. Those are other sections.

## Evidence

Pin assertions are unchanged. `cd mobile && bun test src/services/*.test.ts` passes, including the Psalms 117 chapter pin. `cd mobile && bun run typecheck` passes.

## How to undo

Inline the siblings back into `scripture.ts` and delete them in a later PR that says why.

## Status

Accepted.
