# Davar refactor — 2026-10-07

## Outcome

Draft PR [#255](https://github.com/jhonnyisaacc/davar/pull/255) (`cursor/fix-web-typecheck-86fd` into `feat/davar-v2`). It fixes the red Web CI typecheck. The knowledge boundary check was already green on `feat/davar-v2` and still passes. Not merged.

## What changed

`NavigationBar` types its `books` prop as a readonly list. The bar only reads that list (`filter` and `find`). The book-selector test fixture is `as const`, so `books` was a readonly tuple. Web CI `tsc` rejected it:

`web/src/app/components/NavigationBar.test.tsx(47,37): error TS2322` — readonly tuple not assignable to a mutable `books` array.

Callers that pass a mutable array still typecheck. Runtime behavior is unchanged.

## Checks

| Check | On `feat/davar-v2` | This change |
| --- | --- | --- |
| Web CI typecheck | Fail, run [37613868519](https://github.com/jhonnyisaacc/davar/actions/runs/37613868519) | Pass on this PR, run [37678090720](https://github.com/jhonnyisaacc/davar/actions/runs/37678090720) (lint, `tsc`, static-data tests, build, `bun test`). |
| Knowledge boundary | Pass, run [37613868665](https://github.com/jhonnyisaacc/davar/actions/runs/37613868665) (`davar-compatibility`) | `python -m scripts.knowledge.compatibility boundary --base origin/main` still prints `Shaul output unchanged and legacy import isolation: OK`. |

No gate, test, or baseline was loosened. The earlier boundary failure (run 37611663475, non-additive edit of `.github/workflows/knowledge-foundation.yml`) was already fixed on `feat/davar-v2` by `97604f016`.

## Tier B

Accept a readonly book list on the navigation bar instead of dropping `as const` on the test fixture. Dropping `as const` would widen the other literal props (`activeDestination`, `theme`, `language`) and fail the same typecheck for a different reason.

No pin files, ratchet baselines, CI workflows, or public API routes changed.

## Scripture pins

Draft PR [#260](https://github.com/jhonnyisaacc/davar/pull/260) (`refactor/scripture-pins` into `cursor/fix-web-typecheck-86fd`, stacked on #255). Pins only. The book map is not deduped. Not merged.

Locked `shared/staticDataPaths.ts` path strings, the Bani golden `מִקְוֶה` / H4723 (`miqveh`, guide `MIQveh`, stress syllable 1), web `getVerse("psalms", 117, 1)`, and mobile `fetchChapterVerses("psalms", 117)`. Today's bugs stay: web positions start at 0, mobile positions start at 1, H3068 has no transliteration, and the mobile chapter includes `translation: ""`. Decision: `docs/decisions/0001-scripture-loader-pins.md`.

```
PYTHONPATH=. python -m pytest -q tests/pins
cd web && bun test src/app/services/staticDataPaths.pin.test.ts src/app/services/verseLoad.pin.test.ts
cd mobile && bun test src/services/chapterLoad.pin.test.ts
```

## TS2009 book-file map

Draft PR [#265](https://github.com/jhonnyisaacc/davar/pull/265) (`refactor/book-file-map` into `refactor/scripture-pins`, stacked on #260). One shared map. Not merged.

`shared/ts2009BookFileMap.ts` exports the 66-entry `TS2009_BOOK_FILE_MAP`. The copies in the web loader, the mobile loader, and the static-data generator now import it. Values are the same. The generator-only legacy map stays in `scripts/generate-static-data/index.ts`. `staticData.ts` is not split. Pin assertions are unchanged. Decision: `docs/decisions/0002-ts2009-book-file-map.md`.

Local checks on this branch:

| Check | Result |
| --- | --- |
| `PYTHONPATH=. python -m pytest -q tests/pins` | 1 passed |
| `cd web && bun test src/app/services/staticDataPaths.pin.test.ts src/app/services/verseLoad.pin.test.ts src/app/services/staticData.loading.test.ts` | 16 pass |
| `cd mobile && bun test src/services/*.test.ts` | 71 pass |

No ratchet baseline, ignore count, or public route changed.

## Shared scripture path helpers

Draft PR [#268](https://github.com/jhonnyisaacc/davar/pull/268) (`refactor/shared-scripture-helpers` into `refactor/book-file-map`, stacked on #265). Pure path and book-file resolution. Not merged.

`shared/scripturePaths.ts` builds TS2009 book-file stems and the scripture asset paths. The web loader, the mobile loader, and the static-data generator call it. The 66-entry map stays in `shared/ts2009BookFileMap.ts`. Web still fetches static JSON in `staticData.ts`. Mobile still reads SQLite in `database.ts` and `scripture.ts`. The generator-only legacy map stays in `scripts/generate-static-data/index.ts`. `staticData.ts` is not split. Pin assertions are unchanged. Decision: `docs/decisions/0003-shared-scripture-paths.md`.

Local checks on this branch:

| Check | Result |
| --- | --- |
| `PYTHONPATH=. python -m pytest -q tests/pins` | 1 passed |
| `cd web && bun test src/app/services/staticDataPaths.pin.test.ts src/app/services/verseLoad.pin.test.ts src/app/services/staticData.loading.test.ts` | 16 pass |
| `cd mobile && bun test src/services/*.test.ts` | 71 pass |

No ratchet baseline, ignore count, or public route changed.
