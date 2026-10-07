# Settings

Settings changes how Scripture is displayed: theme, language, and the reading toggles.

## Sub-features

- `settings-open` opens the settings screen from its URL.
- `settings-nav` opens the settings menu from the top navigation.
- `settings-theme` shows the dark-theme switch.

## How to get to it (user POV)

- Choose `Settings` in the top navigation. That opens the settings menu on the verse screen.
- Open `/settings`. On a cold load the app can replace that URL with the saved verse route before the settings screen stays up.

## Driving it with the web control CLI

Preconditions:

- `bun scripts/control/web.ts doctor` prints `status ok`.

- **Navigation entry.** From the reader, choose `Settings`. Run `bun scripts/control/web.ts drive open /verse/Genesis/1/1` and `bun scripts/control/web.ts drive click "Settings"`. The URL stays on the verse and the visible text contains `Dark theme` and `Text Sources`.
- **Proof.** Run `bun scripts/control/web.ts state` and `bun scripts/control/web.ts evidence`. `state.txt` includes `Dark theme`.

## Gotchas

- The `Settings` navigation button opens a menu. It does not change the URL to `/settings`.
- A cold `drive open /settings` can time out on the verse URL. Use the navigation entry above.
- Theme and language stay in browser storage for this Chrome profile. Reset deletes that profile with the run directory.
