# 0003 — Shared scripture path helpers

## Context

Section 4c. The web loader, the mobile loader, and the static-data generator each resolved TS2009 book-file stems. Web and mobile also built the same scripture asset paths inline. The 66-entry map already lives in `shared/ts2009BookFileMap.ts`.

## Decision

Export pure path and book-file helpers from `shared/scripturePaths.ts`. Callers import those helpers. The map stays in its own module. The generator keeps `TS2009_LEGACY_BOOK_FILE_MAP` and passes that stem into `ts2009BookLookupPaths`. Web still fetches static JSON inside `staticData.ts`. Mobile still reads SQLite inside `database.ts` and `scripture.ts`, and still requests static JSON through `api.ts`.

## Alternatives

- Add the helpers to `shared/staticDataPaths.ts`. That module's path strings are pinned. A sibling leaves the pin file untouched.
- Make mobile fetch the way web does. The loaders stay separate.
- Move the legacy map into the shared module. It is generator-only, and section 4b left it in the generator.

## Evidence

Web and mobile stem order stays mapped name, book id, underscore variant. Generator order stays mapped name, legacy stem, book id, underscore variant, then `${stem}.json` and `ts2009/${stem}.json`. Pin assertions are unchanged.

## How to undo

Inline the helpers and delete `shared/scripturePaths.ts` in a later PR that says why.

## Status

Accepted.
