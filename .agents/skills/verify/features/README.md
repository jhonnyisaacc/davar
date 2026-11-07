# Davar verification map

This directory holds the recipes for verifying what a reader sees in Davar. Read this index before driving, then follow the matching feature file. Every recipe drives the app through the control CLIs in `scripts/control/`, run from the repository root. `feature-map.md` at the repository root lists the unit-test checks for each feature. This map covers driving the real app.

## Baseline preconditions

- Web: `bun scripts/control/web.ts start`, with `CHROME_PATH` set to a Chromium build when `google-chrome` is not on `PATH`. `bun scripts/control/web.ts doctor` prints `status ok` with `url http://127.0.0.1:5173`.
- The browser profile is new each `start`, so there is no saved verse, city, language, or theme.
- Features marked as needing the API also need `DATABASE_URL` set and `bun scripts/control/api.ts start` (port 3000).
- The knowledge worker is the tmux session `davar-verify-worker` from `bun scripts/control/worker.ts start`.
- Run `doctor` for the app first. Never drive an instance or a port this run didn't start.

## Driving conventions

- Navigate with `drive open <path>` and act with `drive click <exact label>`. A label is the `aria-label`, or else the whitespace-collapsed text, matched case-sensitively and whole.
- The top tabs are named `Scripture`, `Calendar`, and `Settings` when the UI language is English.
- The browser window is 390x844, so the phone layout is what you drive. `Next verse` and `Previous verse` render there.
- Treat every command as literal. Keep quoted labels unchanged.
- Cleanup never deletes `artifacts/verify/`.

## Proof and skip reporting

- Run `evidence` before and after the action under test, and read both screenshots.
- Web proof is the URL, the visible text, and the screenshot. HTTP proof is the status and body. Worker proof is the exit code and output tail.
- Record the feature ID and the entry point you used. A proof through one entry point does not cover the others the recipe lists.
- If a step needs an action the harness lacks (typing, scrolling, keys, `<select>`, viewport), report it as not driven and name the missing action. Don't count a different path as proof.

## Feature entry contract

Each feature file starts with an H1 and one paragraph about the behavior a user sees. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with scripts/control`, and `Gotchas`.

## Features

- [Read a verse](./read-verse.md) covers opening a verse by URL and stepping to the next verse. Driven end to end on 2026-10-11.
- [Select a book](./select-book.md) covers the Book control and the book list.
- [Open a word meaning](./word-meaning.md) covers the first-word hint and closing the word sheet.
- [Settings](./settings.md) covers the settings panel, UI language, and reading options.
- [Text sources](./text-sources.md) covers the text-source list opened from Settings.
- [Calendar](./calendar.md) covers the Calendar tab and the city prompt shown on first use.
- [Commentary](./commentary.md) covers the commentary screen, which needs the API.
- [Product API health](./api-health.md) reads `GET /up` from the Hono server.
- [Knowledge worker](./knowledge-worker.md) validates the committed knowledge pilot in a terminal session.
