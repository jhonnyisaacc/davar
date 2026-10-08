# 0004 — Split the web static data loader

## Context

Section 4e. `web/src/app/services/staticData.ts` fetched static JSON, loaded TS2009, and loaded the lexicon in one module. Callers import that module.

## Decision

Move fetch into `web/src/app/services/staticDataFetch.ts`, TS2009 loading into `web/src/app/services/staticDataTs2009.ts`, and lexicon loading into `web/src/app/services/staticDataLexicon.ts`. `staticData.ts` imports those modules and re-exports the same functions and types. Callers keep importing `staticData.ts`. Verse assembly, Greek chapter loading, metadata, and prefixes stay in `staticData.ts`. `prefetchChapterResources` stays there because it calls `getChapterVerses`. Greek lexicon entry loading stays there and calls `loadLexiconEntryAsset` from the lexicon module.

## Alternatives

- Point callers at the new files. The brief says callers stay.
- Move Greek lexicon loading into the lexicon module. It also loads the Greek release manifest and calls `getChapterVerses`, which would import the verse loader back into the lexicon module.
- Move `prefetchChapterResources` with the lexicon. It calls `getChapterVerses`.

## Evidence

Pin files are unchanged. The public exports of `staticData.ts` stay the same. The `biome-ignore` count stays at 6.

## How to undo

Move the three modules back into `staticData.ts` and delete them in a later PR that says why.

## Status

Accepted.
