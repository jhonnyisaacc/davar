# Davar

Davar (דבר, "word") is a minimalist Bible study app for Hebrew Scriptures (Tanakh and Besorah), including Qumran variants and a custom dictionary. Cursor and Codex both read this file. Do not add a second instruction tree under `.github/prompts/` or `.github/instructions/`. Tool-specific skills are extra; they must not restate this file.

## Surfaces

- `web/`: Bun and React. Static JSON on Cloudflare Pages. TS2009 from Supabase Storage.
- `mobile/`: React Native and Expo, with SQLite for offline reading.
- `shared/`: pure helpers imported by web and mobile.
- `data/` and `scripts/`: source datasets and the Python pipelines that build them.
- `tools/bani/`: Hebrew transliteration engine. `scripts/translit/` is the batch pipeline that calls it.

JavaScript installs, scripts, and tests use Bun from the surface directory (`web/` or `mobile/`). Do not suggest npm, yarn, pnpm, or deno.

## Product rules

- Write code, comments, and documentation in English.
- Hebrew UI is RTL. Keep the neumorphic, contemplative layout.
- Do not modify licensed content, remove required attributions, or commit secrets, tokens, or private datasets.
- Public code may ship with mock data. Licensed texts stay off the public branch.
- Preserve current reading behavior when refactoring. Do not add Shaul, Bore, or Qahal features in a cleanup change.

## Releases

Mobile publication uses Expo commands and the repository secret `EXPO_TOKEN`. Never commit that token. JavaScript-only `mobile/` changes on `main` use `eas update`. Changes to native projects, `runtimeVersion`, the app version, `ios/`, `android/`, or `eas.json` use `eas build` and then `eas submit`. Do not run those commands for a pull request.

## Assistant habits

- Summarize the change and name the files. Show a diff only when asked.
- When a JavaScript command is required, give the exact Bun command and the directory it runs in.
