# GitHub Environments Setup (gh CLI)

This repo uses four environments for clean deployment records:

- development
- production
- mobile-preview
- mobile-production

## One-time setup

Run from repository root:

```bash
chmod +x .github/scripts/setup-github-environments.sh
```

Optional: set a mobile production reviewer user ID.

```bash
export MOBILE_REVIEWER_ID=<github_numeric_user_id>
```

Optional: set Expo token now so it is written to both mobile environments.

```bash
export EXPO_TOKEN=<your_expo_token>
```

Then run:

```bash
.github/scripts/setup-github-environments.sh
```

## Useful verification commands

```bash
gh api repos/jhonnyisaacc/davar/environments --jq '.environments[].name'
gh api repos/jhonnyisaacc/davar/environments/production
gh api repos/jhonnyisaacc/davar/environments/mobile-production
```

## Notes

- Main branch requires `production` deployment via ruleset.
- Mobile releases are manually triggered by workflow and map to `mobile-preview` or `mobile-production`.
- Automatic Mobile EAS reads the repository secret `EXPO_TOKEN`. The environment secrets below are for the manual release workflow.
- If `EXPO_TOKEN` was not set before running the script, add it later:

```bash
gh secret set EXPO_TOKEN --repo jhonnyisaacc/davar --env mobile-preview
gh secret set EXPO_TOKEN --repo jhonnyisaacc/davar --env mobile-production
```

## Mobile EAS secrets

Automatic publish is `.github/workflows/mobile-eas.yml`. A push to `main` that changes `mobile/**` or `shared/**` runs it, and so does `workflow_dispatch`. Expo commands run only on `refs/heads/main`. The workflow has no GitHub environment, so put these secrets on the repository:

- `EXPO_TOKEN`, for every `eas` command. Also store it on `mobile-preview` and `mobile-production` for `.github/workflows/mobile-eas-release.yml` (commands in Notes).
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, the Play Console service account JSON file contents.

Android submit writes that JSON to `mobile/secrets/google-play-service-account.json` with mode `600`. An `always()` step deletes the file, including when a later step fails. `mobile/secrets/` is gitignored.

The Play secret is required when Android submit runs: an automatic native build, or a manual `build-and-submit` for platform `android` or `all`. Manual `update`, manual `build`, and iOS-only `build-and-submit` run without the Play secret. A missing secret on an Android submit fails the job before `eas build` and `eas submit`.

`mobile/eas.json` submits Android on the Play track `production` with `releaseStatus` `completed`.

iOS submit uses the App Store Connect API key stored on EAS project `232e7627-d0c9-4b88-976e-b4855beb322e`. The key stays on that EAS project. A missing key fails `eas submit` for iOS.

A JavaScript-only diff, including files under `shared/**`, runs `eas update`. Plugin, permission, icon, native-dependency, `runtimeVersion`, app version, and `eas.json` diffs run `eas build` and `eas submit`. Generated `mobile/ios` and `mobile/android` trees are gitignored, so the classifier reads `mobile/app.json` and `mobile/package.json` for those native signals. Pull requests that change either workflow run a fixture check with a fake Play JSON and do not call Expo.

```bash
gh secret set EXPO_TOKEN --repo jhonnyisaacc/davar
gh secret set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON --repo jhonnyisaacc/davar < play-service-account.json
```

## Web preview API secrets (repo-level)

`web-preview` resolves `PUBLIC_API_URL` at build time (see
[railway-preview.md](./railway-preview.md)). Prefer staging:

```bash
gh secret set STAGING_API_URL --repo jhonnyisaacc/davar --body 'https://davar-staging.up.railway.app'
```

Keep `PUBLIC_API_URL` only as a fallback when `STAGING_API_URL` is unset.

## Pull requests

Open pull requests against `main`. Staging is the Railway environment at
`https://davar-staging.up.railway.app`, not a git branch these docs ask
you to target. `.github/rulesets/staging.json` is left in the repo and is
not applied from this guide.
