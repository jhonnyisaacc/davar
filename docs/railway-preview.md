# Railway API + Cloudflare preview wiring

The product API lives in `api/` and deploys on Railway. Cloudflare Pages
previews for non-draft PRs need a `PUBLIC_API_URL` at build time. The
resolver is `scripts/preview-api-url.sh`, called from
`.github/workflows/web-preview.yml`.

There is no `railway.toml` / Dockerfile in the repo; service config lives in
the Railway dashboard (project `davar`, service `davar`).

## PreviewApiTarget

| Diff touches the API path set | Source | URL |
| --- | --- | --- |
| yes | `railway-pr` | HTTPS origin from the Railway GitHub bot comment (`*.up.railway.app`) |
| no | `railway-staging` | GitHub secret `STAGING_API_URL` |
| no (fallback) | `fallback` | GitHub secret `PUBLIC_API_URL` |

The API path set matches `.github/workflows/api-ci.yml` and Railway focused
watch patterns:

- `api/**`
- `shared/product*.ts`
- `contracts/biblical-knowledge/**`
- `data/knowledge/registries/**`

The script prints one origin (no trailing slash) to stdout and logs the
source on stderr. `PUBLIC_*` values are baked into the web bundle by
`web/build.ts` (`define`), so the origin is fixed per preview deploy.

## GitHub secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `STAGING_API_URL` | preferred for non-API-path PRs | Staging Railway HTTPS origin |
| `PUBLIC_API_URL` | fallback | Legacy / temporary shared API origin |
| `CLOUDFLARE_API_TOKEN` | yes | Pages deploy |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Pages deploy |

Set repo secrets (not environment-scoped) so `web-preview` can read them:

```bash
gh secret set STAGING_API_URL --repo jhonnyisaacc/davar --body 'https://<staging>.up.railway.app'
```

Production Pages (`davar.bible`) is built by Cloudflare's Git integration on
`main`, not by `web-preview.yml`. Set `PUBLIC_API_URL` in the Cloudflare Pages
**production** environment before relying on hosted web auth against Railway;
an empty value falls back to `http://127.0.0.1:3000` in
`web/src/app/services/productApi.ts`.

## Railway dashboard checklist

These steps are not available through the Railway MCP API (except staging
watch/root patches, which can be staged via MCP).

1. **Root directory / watch patterns (production)**  
   Staged on production: Root Directory `/server` → `/api`, Watch Patterns
   `api/**`, `shared/product*.ts`, `contracts/biblical-knowledge/**`,
   `data/knowledge/registries/**`. Accept that deploy only after `api/` is
   on the branch Railway builds from (do not accept while production still
   expects `server/`).

2. **Staging environment**  
   Duplicate production into a `staging` environment (own Postgres,
   `NODE_ENV=staging`, own encryption keys). Give the staging service a
   public domain. Put that domain in `STAGING_API_URL`.

3. **PR Environments**  
   Enable **PR Environments** and **Focused PR Environments** for the
   `davar` service so PRs that change the API path set get an ephemeral
   `*.up.railway.app` URL. Base PR envs on staging, not production.

4. **GitHub repo connection**  
   Confirm the Railway service source is `jhonnyisaacc/davar` (dashboard may
   still show the old slug `edyhvh/davar` via redirect) and that the
   Railway GitHub app can comment on PRs in this repo.

5. **`API_HOSTS` and `API_PUBLIC_URL` per environment**  
   Hosted boot requires HTTPS `API_PUBLIC_URL` and a non-empty `API_HOSTS`
   (`api/src/lib/config.ts`). `API_HOSTS` is exact-match only (no wildcards);
   include each environment's Railway hostname (for PR envs, derive from
   `RAILWAY_PUBLIC_DOMAIN` / the generated domain). A missing host returns
   `403 forbidden_host` even on `/up`.

6. **CORS**  
   Browser CORS already allows `https://davar.bible` and
   `https://*.davar.pages.dev` in `api/src/services/webOrigins.ts`. Extra
   `WEB_ORIGINS` are only needed for non-Pages preview hosts.

## Known hosted gaps (not fixed by preview wiring)

- **Railpack root `/api` omits repo `data/`.** `loadBookIds()` reads
  `data/knowledge/registries/books.json` from `DAVAR_REPO_ROOT` / walked
  parents (`api/src/services/context.ts`). With root directory `/api`, that
  file is not in the image unless you change the build layout, copy the
  registry into `api/`, or set `DAVAR_REPO_ROOT` to a tree that contains
  `data/`. Commentary context validation is the first caller that throws
  `ENOENT` when the file is missing.
- **No healthcheck path** is configured on the Railway service today.
  Re-adding `/up` requires the healthcheck Host to be listed in `API_HOSTS`.
- **Auto-deploy trigger branch** is not exposed by the Railway API; confirm
  in the dashboard that pushes (or PR envs) actually rebuild the service.

## Local check

From the repo root, with a range outside the API path set:

```bash
STAGING_API_URL=https://example.up.railway.app \
  bash scripts/preview-api-url.sh --base HEAD --head HEAD
```

When the range includes the API path set, pass `--pr <n>` and set
`GITHUB_REPOSITORY` plus `GH_TOKEN` (or `GITHUB_TOKEN`).
