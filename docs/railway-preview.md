# Railway API + Cloudflare preview wiring

The product API lives in `api/` and deploys on Railway. Cloudflare Pages
previews for non-draft PRs need a `PUBLIC_API_URL` at build time. The
resolver is `scripts/preview-api-url.sh`, called from
`.github/workflows/web-preview.yml`.

## PreviewApiTarget

| Diff touches `api/` | Source | URL |
| --- | --- | --- |
| yes | `railway-pr` | HTTPS origin from the Railway GitHub bot comment (`*.up.railway.app`) |
| no | `railway-staging` | GitHub secret `STAGING_API_URL` |
| no (fallback) | `fallback` | GitHub secret `PUBLIC_API_URL` |

The script prints one origin (no trailing slash) to stdout and logs the
source on stderr.

## GitHub secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `STAGING_API_URL` | preferred for non-`api/` PRs | Staging Railway HTTPS origin |
| `PUBLIC_API_URL` | fallback | Legacy / temporary production or shared API origin |
| `CLOUDFLARE_API_TOKEN` | yes | Pages deploy |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Pages deploy |

Set repo secrets (not environment-scoped) so `web-preview` can read them:

```bash
gh secret set STAGING_API_URL --repo jhonnyisaacc/davar --body 'https://<staging>.up.railway.app'
```

## Railway dashboard checklist

These steps are not available through the Railway MCP API.

1. **Root directory / watch patterns (production)**  
   Staged on production: Root Directory `/server` → `/api`, Watch Patterns
   `["api/**"]`. Accept that deploy only after `api/` is on the branch
   Railway builds from (do not accept while production still expects
   `server/`).

2. **Staging environment**  
   Duplicate production into a `staging` environment. Give the staging
   service a public domain and copy/adjust variables (`API_HOSTS`,
   `API_PUBLIC_URL`, encryption keys, `DATABASE_URL` pointing at a
   staging Postgres). Put that domain in `STAGING_API_URL`.

3. **PR Environments**  
   Enable **PR Environments** and **Focused PR Environments** for the
   `davar` service so PRs that change `api/**` get an ephemeral
   `*.up.railway.app` URL. Focused mode uses the same watch pattern
   `api/**`.

4. **GitHub repo connection**  
   Confirm the Railway service source repo is `jhonnyisaacc/davar` (not
   a fork slug) so PR comments land on the same issues `web-preview`
   polls.

5. **CORS / hosts**  
   Staging and PR API instances need `WEB_ORIGINS` (and `API_HOSTS`) that
   allow Cloudflare Pages preview hosts (`*.davar.pages.dev` / the
   project preview pattern you use).

## Local check

From the repo root, with a non-`api/` range:

```bash
STAGING_API_URL=https://example.up.railway.app \
  bash scripts/preview-api-url.sh --base HEAD --head HEAD
```

When the range includes `api/` paths, pass `--pr <n>` and set
`GITHUB_REPOSITORY` plus `GH_TOKEN` (or `GITHUB_TOKEN`).
