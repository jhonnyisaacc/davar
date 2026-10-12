# 0007 — Move web calendar and assemblies into feature folders

## Context

Section 4g. `CalendarPanel.tsx` and `AssembliesWorkspace.tsx` lived in `web/src/app/components/`. Assemblies UI pieces already live under `web/src/app/features/assemblies/`. Mobile already has calendar and assemblies feature folders. `WordCard.tsx` already lives under `web/src/app/features/reader/` from section 4k.

## Decision

Move `CalendarPanel.tsx` to `web/src/app/features/calendar/CalendarPanel.tsx` and `AssembliesWorkspace.tsx` to `web/src/app/features/assemblies/AssembliesWorkspace.tsx`. Callers and the existing tests import them from those folders. Screen output stays the same. `WordCard.tsx` stays where section 4k put it. `shared/` and `mobile/` stay unchanged.

## Alternatives

- Leave the two files in `web/src/app/components/` and only move new code later. The panels already own those screens.
- Move the pin tests into the feature folders in this PR. The pins stay next to the other component tests. Only their import paths change.

## Evidence

`CalendarPanel.test.tsx` and `Assemblies.test.tsx` keep the same assertions. `shared/` and `mobile/` are unchanged. The `biome-ignore` count stays at 6.

## How to undo

Move both files back to `web/src/app/components/` and restore the caller and test imports in a later PR that says why.

## Status

Accepted.
