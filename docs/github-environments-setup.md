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
- If `EXPO_TOKEN` was not set before running the script, add it later:

```bash
gh secret set EXPO_TOKEN --repo jhonnyisaacc/davar --env mobile-preview
gh secret set EXPO_TOKEN --repo jhonnyisaacc/davar --env mobile-production
```

## Web preview API secrets (repo-level)

`web-preview` resolves `PUBLIC_API_URL` at build time (see
[railway-preview.md](./railway-preview.md)). Prefer staging:

```bash
gh secret set STAGING_API_URL --repo jhonnyisaacc/davar --body 'https://davar-staging.up.railway.app'
```

Keep `PUBLIC_API_URL` only as a fallback until staging exists.

## Set mobile EAS secrets

`mobile-eas` publishes on a push to `refs/heads/main`, and from `workflow_dispatch` on that same branch. It does not run on a pull request. A push to `main` that only changes `shared/**` publishes an OTA update, because the mobile app imports code from `shared/`.

The automatic workflow reads the repository secret `EXPO_TOKEN`. The manual workflow reads `EXPO_TOKEN` from `mobile-preview` or `mobile-production`. Set the repository secret and both environment secrets. The one-time setup section has the environment commands.

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is the Play Console service account JSON. Set it on the repository. The automatic workflow does not use a GitHub environment, so an environment-only copy of this secret is not visible there. Do not commit the JSON file.

Android submit checks that secret before `eas build`. After the build finishes, the job writes the JSON to `mobile/secrets/google-play-service-account.json` with mode 600. It then runs `eas submit`. Cleanup deletes the file at the end of the job, including when a later step fails. The job writes the file only when an Android submit runs. An iOS-only submit does not read the file. `update` and `build` do not need the file. If an Android submit would run and the secret is missing, the job fails before `eas build`. It also fails before `eas build` when the secret is not a service account JSON.

The production submit profile in `mobile/eas.json` sends the Android build to the Play track `production` with release status `completed`.

App Store Connect credentials are not configured. iOS submit still needs them. Without those credentials, `eas submit` for iOS fails.

```bash
gh secret set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON --repo jhonnyisaacc/davar < google-play-service-account.json
```

Redirect the raw JSON key from Play Console.

## Staging branch ruleset

Definition: `.github/rulesets/staging.json` (PR required, no force-push,
no deletion). Apply with admin `gh` (cloud agent tokens get 403):

```bash
gh api --method POST repos/jhonnyisaacc/davar/rulesets --input .github/rulesets/staging.json
```
