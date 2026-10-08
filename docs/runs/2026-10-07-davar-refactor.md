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

## 4d. Fold mobile components

Draft PR [#257](https://github.com/jhonnyisaacc/davar/pull/257) (`cursor/fold-mobile-components-3cf2` into `cursor/fix-web-typecheck-86fd`, stacked on #255). Not merged. Does not target `main`.

`mobile/components/**` now lives in `mobile/src/components/` (`themed-view`, `themed-text`, `parallax-scroll-view`, `external-link`, `haptic-tab`, `ui/`). `mobile/app/(tabs)/explore.tsx` imports those paths. The explore route stays. Screen copy is unchanged.

Verify: `cd mobile && bun run typecheck && bun test`. Typecheck passed. 82 tests passed, 0 failed.

Tier B: keep the kebab-case filenames and the `ui/` layout. Callers use `@/src/components/...`. `HapticTab` has no callers; it moves with the tree and is not deleted. No new behavior, dependencies, comments, or pin edits.

## 4h. Word analysis sheet

Draft PR [#263](https://github.com/jhonnyisaacc/davar/pull/263) (`refactor/split-word-sheet` into `cursor/fold-mobile-components-3cf2`, stacked on #257). Not merged. Does not target `main`. Does not rename #257 or #255.

`WordAnalysisBottomSheet.tsx` moves from `mobile/src/components/` to `mobile/src/features/reader/`. `VerseDetailContent` still renders it and now imports that path. The sheet's props, tabs, and close behavior stay the same. `VerseDetailContent` is not split.

Tier B: the reader feature folder, because mobile has no word-card feature folder and the sheet opens from the verse reader. The other option was `mobile/src/features/word-card/`. No re-export at the old path. No tests render the sheet, so none were added and none assert hook calls.

Verify: `cd mobile && bun run typecheck && bun test`. Typecheck passed. 82 tests passed, 0 failed.

## 4j. Verse detail screen

Draft PR [#269](https://github.com/jhonnyisaacc/davar/pull/269) (`refactor/split-verse-detail` into `refactor/split-word-sheet`, stacked on #263). Not merged. Does not target `main`.

`VerseDetailContent` stays the screen. It still mounts `WordAnalysisBottomSheet` with the same props. The sheet file stays in `mobile/src/features/reader/`. The verse page, chapter flow, translation-flow rendering, and screen styles move into that reader folder.

Tier B: extract those pieces and leave the screen as the opener. The other option was moving the whole screen into the reader folder and re-exporting it. No screen test covers the word-sheet open, so none were added. The pin is the word-card feature-map check. The React compiler warning list follows `VersePage` and the sheet's current path. The rules stay warnings. No new suppression.

Verify: `cd mobile && bun test && bun run typecheck`. Typecheck passed. 82 tests passed, 0 failed.
