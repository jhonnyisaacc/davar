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

## Knowledge import cycle

Draft PR [#261](https://github.com/jhonnyisaacc/davar/pull/261) (`refactor/knowledge-import-cycle` into `cursor/fix-web-typecheck-86fd`). `pinned_inputs` takes the `Validator` the caller already builds. `scripts/knowledge/core.py` no longer imports `scripts/knowledge/validate.py`.

`PYTHONPATH=. python -m pytest -q tests/test_knowledge_workflow_boundary.py tests/test_knowledge_publication_boundary.py tests/test_knowledge_v2_publication_contract.py` — 13 passed in 1.19s.

Pin assertions in `tests/test_knowledge_*.py` are unchanged. No ratchet, CI, or baseline change.
