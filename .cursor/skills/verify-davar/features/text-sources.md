# Text sources

Text sources lists the Hebrew text, Besorah, translations, and lexicon credits for the reader.

## Sub-features

- `sources-from-settings` opens the list from the settings screen.
- `sources-url` opens `/sources` directly.
- `sources-title` shows the heading `Text Sources`.

## How to get to it (user POV)

- From the verse screen, choose `Settings`, then `Text Sources`.
- Open `/sources`. A cold load can be replaced by the saved verse route, the same way `/settings` can.

## Driving it with the web control CLI

Preconditions:

- `bun scripts/control/web.ts doctor` prints `status ok`.
- The settings menu is closed or open; start from the reader either way.

- **From the reader.** Open Genesis 1:1, choose `Settings`, then `Text Sources`. Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`, `bun scripts/control/web.ts drive click "Settings"`, and `bun scripts/control/web.ts drive click "Text Sources"`. The URL contains `/sources` and the visible text contains `Text Sources` and `Masoretic`.
- **Proof.** Run `bun scripts/control/web.ts evidence`. `state.txt` contains `/sources` and `Text Sources`.

## Gotchas

- `Text Sources` is the button label. `Commentary Sources` is a different screen (`/commentary-sources`).
- The list is local copy. It does not call the Hono API.
- Click `Text Sources` only after `Settings` is open. On the verse screen the name is not visible yet.
