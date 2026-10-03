# Davar mobile

The React Native app uses Expo and Bun. Run all commands below from `mobile/`.

## Get started

1. Install dependencies

   ```bash
   bun install --frozen-lockfile
   ```

2. Start the app

   ```bash
   bun run start
   ```

   In the output, you'll find options to open the app in a

   - [development build](https://docs.expo.dev/develop/development-builds/introduction/)
   - [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
   - [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
   - [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

   You can also run platform-specific commands directly:

   ```bash
   bun run ios
   bun run android
   ```

   You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.
- [Using Bun with Expo](https://docs.expo.dev/guides/using-bun): Official guide for Bun + Expo workflows

## Commands

Development commands share Metro port `8081`. Pass additional Expo flags after
the script name, for example `bun run ios --device "iPhone 18 Pro"`.

| Purpose | Command |
| --- | --- |
| Start Metro | `bun run start` |
| Clear Metro cache | `bun run start:clear` |
| Android development client on localhost | `bun run start:android:localhost` |
| Build and launch locally | `bun run ios` / `bun run android` |
| Regenerate a native project and rebuild | `bun run ios:clean` / `bun run android:clean` |
| Forward Metro, static data, and the API to an Android USB device | `bun run android:reverse` |
| View Android logs | `bun run android:logs` |
| Start Expo web | `bun run web` |
| TypeScript, lint, and all mobile tests | `bun run preflight` |
| Run individual checks | `bun run typecheck` / `bun run lint` / `bun run test` |
| Format / check formatting | `bun run format` / `bun run format:check` |
| Production EAS builds | `bun run build:ios` / `bun run build:android` / `bun run build:all` |
| Local preview EAS builds | `bun run build:ios:local` / `bun run build:android:local` |
| EAS updates | `bun run update:dev` / `bun run update:preview` / `bun run update:prod` |

Biome is installed locally and versioned in `bun.lock`. EAS commands share the
`eas` helper, which runs a pinned CLI version through Bun; use
`bun run eas <command>` for other EAS operations.
`build:*:prod` duplicates have been removed; the regular `build:*` commands
already use the production profile. EAS local builds support one platform per
invocation, so there is no `build:all:local` command. The `*:clean` commands
replace generated native projects; keep native customization in config plugins.

Install Expo-managed libraries with `bun x expo install <package> --bun`, and
check SDK compatibility with `bun x expo-doctor`.

### Browser preview

The mobile app uses `web.output: "single"` for its client-rendered browser
preview. Expo SDK 57's static page renderer tries to serialize SQLite's worker
from a lazy development graph, where the worker is absent, and fails with
`Worker chunk not found`. Client rendering keeps Metro's separate worker
requests working. Mobile web exports also produce a single-page app; the
public website is built separately from `web/`.

After changing the web output mode, stop Metro and run `bun run start:clear`
from `mobile/`, then press `w` to open the browser preview.

## iOS development with Xcode 27

The mobile app uses Expo SDK 57 and React Native 0.86. The
`expo-build-properties` plugin enables `ios.enableSceneSupport` so builds using
Xcode 27 can launch on iOS 27. Expo CLI supports Device Hub.
The generated iOS project targets iOS 16.4 or later.

After upgrading dependencies, regenerate the ignored iOS project. Run these
commands from `mobile/`:

```bash
bun install --frozen-lockfile
bun x expo prebuild --clean --platform ios --no-install
bun run ios --device "iPhone 18 Pro"
```

The first build installs CocoaPods dependencies and compiles a new development
client. Subsequent launches use `bun run ios`. The OTA runtime version
is `1.0.3`; this SDK upgrade requires a new native build before publishing updates
to that runtime. EAS Update commands explicitly select their EAS environment.

SDK 57 also adds React Compiler lint diagnostics. Existing native animation,
layout, and state synchronization patterns remain warnings in the affected
files; standard hook correctness rules remain errors. React Compiler skips
unsupported components until those patterns are migrated.

## Formatting

- Biome handles formatting; Expo ESLint handles lint checks.
- Use `bun run format` to format files or `bun run format:check` to check them.
- Add paths to either command to target specific files, for example
  `bun run format:check package.json biome.json`.
- The Biome config limits formatting to app sources and configuration, and
  respects Git ignores for generated native projects and dependencies.
- Prettier is intentionally not configured at project level in this workspace.

## Static Data Environment Setup

Local services use Rails on `3000`, web/static data on `5173`, and Expo/Metro
on its default port `8081`. Commentary requires a running Rails server; start it
from `api/` with `bundle exec rails server` after following [the API setup](../api/README.md).
Start the static data server from `web/` with `bun run dev`.

Mobile static data endpoints are controlled by Expo public env vars:

- `EXPO_PUBLIC_STATIC_DATA_BASE_URL`
- `EXPO_PUBLIC_STATIC_BUNDLES_BASE_URL`

Resolution order in app code:

1. If `EXPO_PUBLIC_*` vars are set, those values are used.
2. If not set:
   - Development (`__DEV__`): `http://127.0.0.1:5173/data`
   - Production: `https://davar.bible/data`

Local setup:

1. Keep `.env.example` as the committed template.
2. Treat `.env` as safe defaults only (no real secrets, no machine-specific LAN IPs).
3. Create `.env.local` for your machine-specific values.
4. For a physical device, replace `127.0.0.1` with your machine LAN IP.

Production setup:

1. Define the same `EXPO_PUBLIC_*` keys in EAS build environment variables (do not commit production secrets).
2. Point them to the production static JSON origin/path.

Notes:

- TS2009 translations are online-only and loaded from the static chapter JSON origin (`https://davar.bible/data` in production).
- TS2009 is intentionally excluded from the mobile offline bundle download and version-update path; the offline download covers Hebrew text, Spanish TTH, dictionary, and DSS data.
- Supabase is not required by the mobile runtime. The static data URLs above are the source of truth for mobile content.

## OTA Runtime Version Policy

- `expo.runtimeVersion` in [app.json](app.json) is intentionally a plain string for Expo bare workflow compatibility.
- Bump this string only when native compatibility changes (new/updated native modules, native config changes, SDK changes that alter native runtime expectations).
- Do not bump it for JS-only OTA updates, or you will unnecessarily fragment update targets.
- Keep this value aligned with release notes so build/update routing stays predictable.

## EAS Channel Policy

- Build profiles in [eas.json](eas.json) intentionally omit explicit channel fields.
- EAS uses the profile name as the implicit channel, so development, preview, and production map directly without extra channel config.
- Keep profile names stable, because renaming a profile changes its implicit update channel.

## Typography QA Checklist

Use this checklist after changing hebrewVerseMedium in [src/theme.ts](src/theme.ts):

1. Open a verse card screen and verify Hebrew word wrapping, line spacing, and selected-word states remain visually balanced.
2. Open the Settings slider preview and verify the sample Hebrew text scale still matches expected readability.
3. Compare Android and iOS side by side for clipping, overlap, or unexpected row spacing regressions.
4. Verify detail variant text density remains readable compared to card variant.
5. Capture before and after screenshots for VerseCard and Settings preview during release QA.

## Troubleshooting: Android Physical Device Cannot Load Books Metadata

Symptom:

- Logs show `Failed to load books metadata` with `Network request failed`.

Checklist:

1. Ensure phone and development machine are on the same Wi-Fi network.
2. Use LAN-IP endpoints in local env values for physical-device testing:
   - `EXPO_PUBLIC_STATIC_DATA_BASE_URL=http://<YOUR_LAN_IP>:5173/data`
   - `EXPO_PUBLIC_STATIC_BUNDLES_BASE_URL=http://<YOUR_LAN_IP>:5173/data/bundles`
3. Do not use `127.0.0.1` or `localhost` for physical devices.
4. Confirm `http://<YOUR_LAN_IP>:5173/data/metadata.json` opens in the phone browser.
5. Verify your local static server is running and bound to a non-loopback interface.

The app now prints a dev diagnostic line with resolved static URLs and Metro host, and network errors include actionable hints for Android physical-device setup.
