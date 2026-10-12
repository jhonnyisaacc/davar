# Davar web verification map

This directory holds the recipes for verifying what a reader sees in the Davar web app. Read this index before driving the app, then follow the matching feature file. `feature-map.md` at the repository root lists the unit-test checks for each feature. This map covers driving the real app.

## Baseline preconditions

- Start the app with `bun scripts/control/web.ts start` from the repository root, with `CHROME_PATH` pointing at a Chromium build (on this Mac, Brave).
- `bun scripts/control/web.ts doctor` prints `status ok` with `url http://127.0.0.1:5173`.
- The browser profile is new each start, so there is no saved city, language, or theme.
- Features marked as needing the API also need `bun scripts/control/server.ts start` (port 3000).
- Never drive an instance that this run didn't start.

## Driving conventions

- Navigate with `drive open <path>` and act with `drive click <exact label>`.
- The top tabs are named `Scripture`, `Calendar`, and `Settings` when the UI language is English.
- Labels change with the UI language. After you switch to Español or עברית, click by the translated label.
- Treat every command as literal. Keep quoted labels unchanged.

## Proof and skip reporting

- Run `evidence` before and after the action under test, and read both screenshots.
- Record the feature ID and the entry point you used.
- If a step needs an action the harness lacks (typing, scrolling, keys), report it as not driven and name the missing action. Don't count a different path as proof.

## Feature entry contract

Each feature file starts with an H1 and one paragraph about the behavior a user sees. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control/web.ts`, and `Gotchas`.

## Features

- [Read a verse](./read-verse.md) covers opening a verse by URL and stepping to the next verse. Driven end to end on 2026-10-11.
- [Calendar](./calendar.md) covers the Calendar tab and the city prompt shown on first use.
- [Settings](./settings.md) covers the settings panel, UI language, and reading options.
- [Commentary](./commentary.md) covers the commentary screen, which needs the API.
