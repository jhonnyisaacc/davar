# Open a word meaning

A reader selects a Hebrew word in the verse and sees its meaning sheet, then closes it and returns to the same verse.

## Sub-features

- `word-meaning-open` opens the sheet from the first word.
- `word-meaning-close` closes the sheet and leaves the verse in place.

## How to get to it (user POV)

- On a verse, choose the highlighted first word.
- Choose any other Hebrew word in the verse.

## Driving it with scripts/control

Preconditions:

- The baseline web instance is healthy, the UI language is English, and `Hebrew only` is off.

- **Open a verse.** Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`.
- **First word.** Run `bun scripts/control/web.ts drive click Select word`. The text contains `Meanings` when a definition exists, or `No meanings available yet.` or `Definition not available` when it doesn't.
- **Open proof.** Run `bun scripts/control/web.ts evidence`. The screenshot shows the word sheet.
- **Close.** Run `bun scripts/control/web.ts drive click Close word meaning`. The URL still ends in `/verse/Genesis/1/1`.
- **Closed proof.** Run `bun scripts/control/web.ts evidence`. The screenshot shows the verse without the sheet.

## Gotchas

- Not yet driven with the harness. Confirm the sheet text on the first run and update this file.
- Only the first word of a fresh verse has the label `Select word`. Other words are buttons labeled with the Hebrew word itself, so `drive click` needs the exact pointed spelling.
- After a word has been selected once, the next verse's first word may lose the hint label.
- Close with `Close word meaning`, not a browser back navigation.
