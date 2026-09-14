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
