# 0005 — Split the web reader screen state

## Context

Section 4f. `web/src/app/App.tsx` owned reader screen state, route sync, chapter loading, and the word panel in one component. `useScreenNavigation` and `useReadingModes` already lived under `web/src/app/features/reader/`.

## Decision

Move the remaining screen state into hooks in that folder. `App.tsx` reads those hooks and keeps the screen composition, including `WordCard`, `CalendarPanel`, and `AssembliesWorkspace`. Reading position still goes through `getStoredReadingState` and `saveReadingState`, which use `davar.readingState`.

`useReaderPreferences` owns the persisted reader settings. `useReadingPosition` owns the book, chapter, and verse. `useVerseLibrary` owns the book list and chapter load. `useReaderRoute` owns the address bar and the connection screen. `useWordSelection` owns the word panel state. `useReaderChrome` owns scroll chrome and the design overlays. `useReadingModes` and `useScreenNavigation` keep their current contracts.

## Alternatives

- Fold the new state into `useScreenNavigation` and `useReadingModes` only. Route sync, chapter loading, and the word panel are different writers.
- Move `WordCard.tsx` or the calendar and assemblies panels in this PR. Those are later sections.

## Evidence

Pin assertions are unchanged. `shared/` and `mobile/` are unchanged. The storage key stays `davar.readingState`.

## How to undo

Move the hook bodies back into `App.tsx` and delete the new hook files in a later PR that says why.

## Status

Accepted.
