# Davar web verification map

This directory is the maintained source for verifying the Davar web reader. Read this index, then use the matching feature file.

## Baseline preconditions

- Launch with `PORT=5193 HOT_HTML_PORT=5194 HOST=127.0.0.1 bun run dev` from `/Users/jhonny/davar/web`.
- Record that process id in `.cursor/skills/verify-davar-web/run/server.pid`.
- Run `bun .cursor/skills/verify-davar-web/scripts/doctor.ts` from `/Users/jhonny/davar` and require exit 0.
- Open `http://127.0.0.1:5193` in a browser context that has not been used for this origin. That keeps `localStorage` empty, so the reader starts at Genesis 1:1.
- Never drive `http://127.0.0.1:5173` or any server this run did not start.

## Driving conventions

- Start every recipe from Genesis 1:1 in English unless its preconditions say otherwise.
- If the Language combobox is not `English`, set it to `English` first. The names in these files are the English UI.
- Prefer ARIA names and the ids in the skill over coordinates.
- Verse advance buttons exist below 768px wide. Use a 390×844 viewport for those steps, then clear device emulation.
- Write proof to `.cursor/skills/verify-davar-web/artifacts/<feature-id>/`.
- Cleanup may delete `run/`. It must not delete `artifacts/`.

## Proof and skip reporting

- Capture the user action and the resulting URL or control, not only the final screen.
- UI proof includes an accessibility snapshot and a screenshot that show the Davar nav.
- Record the feature id and the entry point with every artifact.
- Report an unreachable path with the attempted action and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with the browser`, and `Gotchas`.

## Features

- [Read a verse](./read-verse.md) covers the deep link, the next-verse button, and desktop wheel.
- [Select a book](./select-book.md) covers the book control and Find book.
- [Open a word meaning](./word-meaning.md) covers the first-word hint and closing the sheet.
- [Change language](./settings-language.md) covers the Settings language combobox.
- [Open the calendar](./calendar.md) covers the Calendar nav button and the `/widgets` deep link.
