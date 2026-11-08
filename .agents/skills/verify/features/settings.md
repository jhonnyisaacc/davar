# Settings

Settings opens as a panel over the current screen. It holds theme, UI language (English, Español, עברית), Gospel language and text, how the verse screen looks, and links to sources, donating, and legal pages. Hebrew flips the layout to right to left.

## Sub-features

- `settings-open` shows the panel with every option group.
- `settings-language` switches the UI to Español or עברית, and Hebrew flips the layout to RTL.
- `settings-reading` toggles reading options: `Full chapter`, `Translation only`, `Hebrew only`, `Qumran`, `Nikud`, `Cantillation`.
- `settings-theme` toggles `Dark theme`.

## How to get to it (user POV)

- Choose the `Settings` tab in the top bar. It opens a panel and doesn't change the URL.
- Open `/settings` directly. On a cold load the app can replace that URL with the saved verse route.

## Driving it with scripts/control

Preconditions:

- The baseline web instance is healthy and the UI language is English.

- **Open a verse.** Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1`.
- **Open Settings.** Run `bun scripts/control/web.ts drive click Settings`. The text contains `Dark theme`, `Text Sources`, and `Nikud`.
- **Proof.** Run `bun scripts/control/web.ts evidence`.
- **Switch language.** Not drivable. `Language` is a `<select>`, and `scripts/control/web.ts` has no select action. Report `settings-language` as not driven. Once the action exists, the panel heading becomes `Ajustes` in Spanish and `הגדרות` in Hebrew, Hebrew renders right to left, and the recipe sets the language back to English before the next feature.
- **Reading options and theme.** Not yet driven. Confirm on the first run whether each toggle is a control `drive click` can reach by its label, and update this file.

## Gotchas

- Opening Settings from a tab doesn't change the URL. On 2026-10-11 it stayed `/widgets` after Calendar was opened first, so don't assert the URL.
- A cold `drive open /settings` can time out on the verse URL. Use the tab.
- Settings persist in the browser profile until `stop` and `start`. A new `start` gives a new profile.
- UI wording exists in English, Spanish, and Hebrew. A wording change has to be checked in all three.
- Only `Open Settings` has been driven (2026-10-11).
