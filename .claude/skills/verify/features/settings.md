# Settings

Settings opens as a panel over the current screen. It holds theme, UI language (English, Español, עברית), Gospel language and text, how the verse screen looks, and links to sources, donating, and legal pages.

## Sub-features

- `settings-open` shows the panel with every option group.
- `settings-language` switches the UI to Español or עברית, and Hebrew flips the layout to RTL.
- `settings-reading` toggles reading options: `Full chapter`, `Translation only`, `Hebrew only`, `Qumran`, `Nikud`, `Cantillation`.
- `settings-theme` toggles `Dark theme`.

## How to get to it (user POV)

- Choose the `Settings` tab in the top bar.
- Open `/settings` directly.

## Driving it with control/web.ts

Preconditions:

- The baseline instance is healthy and the UI language is English.

- **Open Settings.** Run `bun scripts/control/web.ts drive click Settings`. The text contains `Dark theme`, `Language English Español עברית`, and `Nikud`.
- **Before proof.** Run `bun scripts/control/web.ts evidence`.
- **Switch to Hebrew.** Run `bun scripts/control/web.ts drive click עברית`. The tab labels in the text change to Hebrew.
- **After proof.** Run `bun scripts/control/web.ts evidence`. The screenshot shows a right-to-left layout.
- **Restore.** Click the language button that reads `English` in the current UI so later recipes match their English labels.

## Gotchas

- Opening Settings from a tab doesn't change the URL. On 2026-10-11 it stayed `/widgets` after Calendar was opened first, so don't assert the URL.
- Settings persist in the browser profile until `stop`/`start`. A new `start` gives a new profile.
- UI wording exists in English, Spanish, and Hebrew. A wording change has to be checked in all three.
- Only `Open Settings` has been driven (2026-10-11). The language switch and restore steps haven't been run yet. Confirm their output on the first run and update this file.
