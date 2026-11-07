# Text sources

Text sources lists the Hebrew text, Besorah, translations, and lexicon credits for the reader.

## Sub-features

- `sources-from-settings` opens the list from the Settings panel.
- `sources-url` opens `/sources` directly.

## How to get to it (user POV)

- From the verse screen, choose `Settings`, then `Text Sources`.
- Open `/sources`. A cold load can be replaced by the saved verse route, the same way `/settings` can.

## Driving it with scripts/control

Preconditions:

- The baseline web instance is healthy and the UI language is English.

- **Open a verse.** Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`.
- **Open Settings.** Run `bun scripts/control/web.ts drive click Settings`.
- **Open the list.** Run `bun scripts/control/web.ts drive click Text Sources`. The URL contains `/sources` and the text contains `Text Sources` and `Masoretic`.
- **Proof.** Run `bun scripts/control/web.ts evidence`.
- **Deep link.** Run `bun scripts/control/web.ts drive open /sources`. The same heading appears unless the app replaced the route.

## Gotchas

- `Text Sources` is the button label. `Commentary Sources` is a different screen (`/commentary-sources`).
- Click `Text Sources` only after `Settings` is open. On the verse screen the label isn't on the page.
- The list is local copy. It doesn't call the API.
