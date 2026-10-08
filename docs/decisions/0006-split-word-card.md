# 0006 — Move the web word card into the reader feature

## Context

Section 4k. `web/src/app/components/WordCard.tsx` rendered the lexicon card. `App.tsx` was the only caller. Reader hooks already live under `web/src/app/features/reader/`.

## Decision

Move the file to `web/src/app/features/reader/WordCard.tsx`. `App.tsx` imports it from that folder. The card's props, markup, and data loading stay the same. Relative imports inside the file still resolve `web/src/app/hooks` and `web/src/app/utils`. `CalendarPanel.tsx` and `AssembliesWorkspace.tsx` stay in `web/src/app/components/`.

## Alternatives

- Split the card into smaller components in this PR. The card contents stay in one file.
- Move the calendar and assemblies panels in the same PR. Those are section 4g.

## Evidence

No existing test imports `WordCard`. Pin assertions are unchanged. `shared/` and `mobile/` are unchanged. The `biome-ignore` count stays at 6.

## How to undo

Move the file back to `web/src/app/components/WordCard.tsx` and restore the `App.tsx` import in a later PR that says why.

## Status

Accepted.
