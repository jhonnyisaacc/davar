# 0002 — One TS2009 book-file map

## Context

Section 4b. `TS2009_BOOK_FILE_MAP` was copied in the web loader, the mobile loader, and the static-data generator. All three copies were the same 66 entries in the same order. The generator also has `TS2009_LEGACY_BOOK_FILE_MAP`, which exists only there.

## Decision

Export `TS2009_BOOK_FILE_MAP` from `shared/ts2009BookFileMap.ts`, next to `shared/staticDataPaths.ts`. The three copies import that module. The entries stay the same. The legacy map stays in `scripts/generate-static-data/index.ts`.

## Alternatives

- Add the map to `shared/staticDataPaths.ts`. That file's path strings are pinned. A sibling module leaves the pin file untouched.
- Move the legacy map into the shared module. It is not a copy, and the generator inserts it between the shared stem and the raw book id. This step only deletes the duplicated map.

## Evidence

The three objects compared equal before the move: 66 pairs, same order. Each call site still indexes `TS2009_BOOK_FILE_MAP`. Candidate order, chapter paths, and the legacy stems are unchanged.

## How to undo

Restore the three literals and delete `shared/ts2009BookFileMap.ts` in a later PR that says why.

## Status

Accepted.
