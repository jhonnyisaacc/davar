---
name: verify-davar-web
description: Drive the Davar web reader (Bun, React) the way a reader does and capture proof. Use when a change touches verse reading, book navigation, word meanings, settings language, the biblical calendar, or commentary, and the change must be shown in the running app.
---

# Verify Davar web

Davar’s primary surface is the web reader in `web/`. A reader opens one verse, moves to the next, picks a book, and opens a word meaning. The Expo app in `mobile/` is a separate surface; this skill does not drive it.

Drive only an instance this run started. The default dev ports `5173` and `5174` may already belong to a person. A second instance is safe when it uses its own `PORT` and `HOT_HTML_PORT`. Local settings live in `localStorage` for that origin, so a different port is a fresh reader. Do not attach to `http://127.0.0.1:5173`.

## Launch

From `/Users/jhonny/davar/web`:

```sh
PORT=5193 HOT_HTML_PORT=5194 HOST=127.0.0.1 bun run dev
```

Ready when stdout contains:

```text
[davar-web] browse http://localhost:5193
```

and `bun .cursor/skills/verify-davar-web/scripts/doctor.ts` exits 0.

Record the process id in `.cursor/skills/verify-davar-web/run/server.pid` (one line, the `bun run dev` pid). Write stdout and stderr to `.cursor/skills/verify-davar-web/run/server.log`. Create `run/` if it is missing. `web/.env` must exist; do not print it.

`bun run dev` checks static data, then serves the app on `127.0.0.1:5193` and hot reload on `127.0.0.1:5194`. Browse `5193` only.

## Doctor

From the repo root `/Users/jhonny/davar`:

```sh
bun .cursor/skills/verify-davar-web/scripts/doctor.ts
```

Run this before driving whenever the page looks wrong. It checks that `5193` answers, the HTML title is `Davar | Hebrew Scriptures`, `/data/metadata.json` lists Genesis, and the process in `run/server.pid` is alive and owns the listener (the dev command or a child it spawned). Exit 0 means this instance is worth driving. Any other exit means stop and fix launch; do not click around on another port.

Override the port only when launch used the same values:

```sh
DAVAR_VERIFY_PORT=5193 DAVAR_VERIFY_HTML_PORT=5194 bun .cursor/skills/verify-davar-web/scripts/doctor.ts
```

## Drive

Use the Cursor browser tools against `http://127.0.0.1:5193`. Read `.cursor/skills/verify-davar-web/features/README.md`, then the feature file for the behavior under test. One convenient entry point is not proof when that file lists others.

A fresh origin follows the browser language (`en`, `es`, or `he`). The feature files use English accessible names. If the Language control is not `English`, open Settings and set Language to `English` before the rest of the recipe.

Stable handles:

- Nav `Davar` contains buttons `Assemblies` (only when that capability is on), `Commentary`, `Scripture`, `Calendar`, and `Settings`.
- Scripture location nav is named `Book, Chapter, Verse`.
- Book, chapter, and verse controls are buttons named `Book`, `Chapter`, and `Verse`. The book button’s visible text includes the current book, such as `Genesis`.
- Book search is a textbox named `Find book` inside `#navigation-book-selector`.
- The first Hebrew word of a fresh verse is a button named `Select word`. Later words are buttons with class `word-interactive`.
- The word sheet closes with a button named `Close word meaning`.
- Settings is a section named `Settings`. Language is a combobox named `Language` with options `English`, `Español`, and `עברית`.
- Previous and next verse buttons, named `Previous verse` and `Next verse`, render below 768px wide. At desktop width, a downward wheel of at least 36px on the page moves to the next verse after a 500ms cooldown. Prefer the buttons: set the viewport to 390×844, drive, then clear device emulation before the turn ends.
- Deep links are real entry points: `/verse/Genesis/1/1`, `/commentary`, `/widgets`.

## Evidence

Write proof under `.cursor/skills/verify-davar-web/artifacts/<feature-id>/`. Capture the action and the state it produced.

For a UI proof, save an accessibility snapshot and a screenshot that show the Davar nav and the resulting verse, book, or screen. Record the feature id, the entry point, and the final URL.

Side effects that count:

- The address bar changes to `/verse/<Book>/<chapter>/<verse>` after a book pick or verse move.
- The `Verse` button shows the new verse number.
- Opening a word reveals the word sheet; closing it removes `Close word meaning`.
- Changing Language changes the Settings label to `Ajustes` (Spanish) or `הגדרות` (Hebrew). Set it back to `English` before the next feature.
- Calendar shows the heading `Biblical Calendar`.
- Commentary shows either article titles with a `Read` button, the status `Loading...`, or the text `No published articles available yet.`

Do not treat a mocked setter or a unit test as this proof. English verse text may come from the deployed TS2009 fallback; judge the URL, the verse control, and the Hebrew word buttons. Do not copy licensed translation text into the artifact notes.

## Cleanup

Send SIGTERM to the pid in `.cursor/skills/verify-davar-web/run/server.pid`. If that file is missing, do not kill processes by name. The recorded pid is the launch command; `dev-hot.ts` spawns the gateway and the HTML server as children. If `127.0.0.1:5193` or `127.0.0.1:5194` still listen after the parent exits, stop those two listeners only when `ps` shows `dev-hot-gateway.ts` and `dev-hot-html.ts`. Leave every other `bun` process alone. Confirm both ports are free, then remove `.cursor/skills/verify-davar-web/run/`. Leave `.cursor/skills/verify-davar-web/artifacts/` in place. Confirm the proof files still exist after cleanup.

Also clear any device metrics override set for the narrow viewport.

## Helpers

`scripts/doctor.ts` is the only helper. Invoke it with the command in Doctor. It is read-only: it does not start or stop the server.
