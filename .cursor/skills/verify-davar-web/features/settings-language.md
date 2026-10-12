# Change language

A reader opens Settings and switches the interface among English, Spanish, and Hebrew. Hebrew layout is right to left.

## Sub-features

- `settings-language-open` opens the Settings section from the nav.
- `settings-language-spanish` switches labels to Spanish.
- `settings-language-hebrew` switches the page to right-to-left Hebrew.
- `settings-language-restore` returns the interface to English.

## How to get to it (user POV)

- Choose `Settings` in the Davar nav.
- Change the `Language` combobox.

## Driving it with the browser

Preconditions:

- Doctor exited 0 for `http://127.0.0.1:5193`.
- Start from English so the control names match this file.

- **Open Settings.** Choose `Settings`. A section named `Settings` appears and contains a combobox named `Language` whose value is `English`.
- **Spanish.** Set `Language` to `Español`. The settings section name becomes `Ajustes`. The Scripture button label stays available so the reader can return.
- **Hebrew.** Set Language to `עברית`. The settings section name becomes `הגדרות` and the nav direction is right to left.
- **Restore.** Set Language back to `English`. The section name is `Settings` again. Leave the app in English for the next feature.
- **Proof.** Save the Spanish state to `artifacts/settings-language/spanish.snapshot.txt` and `artifacts/settings-language/spanish.png` before restoring English. The snapshot shows `Ajustes`.

## Gotchas

- `Settings` toggles a menu. It does not navigate to `/settings` by itself. The deep link `/settings` is a separate route and is not this menu.
- Language is stored in `localStorage` for this origin. Restoring English is part of the recipe.
- Assemblies may be absent from the nav when that product flag is off. Its absence does not fail this feature.
