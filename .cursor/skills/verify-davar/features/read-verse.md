# Scripture reader

The reader shows one verse of Scripture, the book and chapter controls, and the next and previous verse controls.

## Sub-features

- `verse-open` loads a verse from its URL.
- `verse-next` moves to the following verse from the on-screen control.
- `verse-state` reports the URL and the visible passage.

## How to get to it (user POV)

- Open `/verse/Genesis/1/1`.
- Open `/`, which is the verse screen, then choose the book, chapter, and verse.
- Choose `Scripture` in the top navigation when another screen is open.
- On the phone, open the same reader in the Expo app. Driving that screen is not available in this repo.

## Driving it with the web control CLI

Preconditions:

- `bun scripts/control/web.ts doctor` prints `status ok` and `url http://127.0.0.1:5173`.
- Static data finished generating, so `server.log` contains `static-data=ready`.

- **Open Genesis 1:1.** Visit `/verse/Genesis/1/1`. Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`. The URL contains `/verse/Genesis/1/1` and the visible text contains `Genesis`.
- **Confirm the passage.** Read the screen. Run `bun scripts/control/web.ts state`. `text` contains `Genesis` and the reader is not on `Page Not Found`.
- **Next verse.** Choose `Next verse`. Run `bun scripts/control/web.ts drive click "Next verse"`. The URL or the verse control changes from verse 1 to the next verse.
- **Proof.** Run `bun scripts/control/web.ts evidence`. The artifact directory contains `screenshot.png`, `state.txt`, and `transcript.txt` for this open and click.

## Gotchas

- The first `start` generates `web/public/data` and can take several minutes before the port opens. Wait for `status ok`; do not point Chrome at a different server.
- A short page that says `Connection Error` or `Unable to load books` means static data was not served. That is a failed open, not a successful read.
- `Book` is the accessible name of the book control. The navigation landmark is named `Book, Chapter, Verse` and is not a click target.
- Chrome for this CLI is 390 by 844. `Next verse` is on that narrow layout (`md:hidden` in the reader). A wide window shows `Scroll up for next verse` instead of the button.
- `bun scripts/control/mobile.ts drive` exits `maestro-unimplemented`. Doctor and state still report the app version and bundle id.
