# Open a word meaning

A reader selects a Hebrew word in the verse and sees its meaning sheet, then closes it and returns to the verse.

## Sub-features

- `word-meaning-open` opens the sheet from the first word.
- `word-meaning-close` closes the sheet and leaves the verse in place.

## How to get to it (user POV)

- On a verse, choose the highlighted first word.
- Choose any other Hebrew word in the verse.

## Driving it with the browser

Preconditions:

- Doctor exited 0 for `http://127.0.0.1:5193`.
- Open `http://127.0.0.1:5193/verse/Genesis/1/1`.
- Language is English.
- Hebrew only mode is off, so the verse and its translation are both on screen.

- **First word.** Choose the button named `Select word`. A button named `Close word meaning` appears, and the sheet shows the heading area for that word, including `Meanings` when a definition exists.
- **Close.** Choose `Close word meaning`. That button disappears. The URL remains `/verse/Genesis/1/1` and the `Verse` button text is still `1`.
- **Proof.** Save the open sheet to `artifacts/word-meaning/open.snapshot.txt` and `artifacts/word-meaning/open.png` before closing. The snapshot includes `Close word meaning` and the Davar nav.

## Gotchas

- Only the first word of a fresh verse exposes the name `Select word`. Other words are `word-interactive` buttons whose accessible name is the Hebrew word.
- The hint is for onboarding. After a word is selected, the next verse’s first word may be an ordinary `word-interactive` button. Choose the first `word-interactive` button in that case.
- Closing uses `Close word meaning`, not the browser back button.
- Definitions come from `/data/dict/*`. A missing meaning shows `No meanings available yet.` or `Definition not available`, which still proves the sheet opened.
