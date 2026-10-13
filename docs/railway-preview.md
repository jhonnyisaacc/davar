# Railway API + Cloudflare preview wiring

The product API lives in `api/` and deploys on Railway. Cloudflare Pages
previews for non-draft PRs bake in `PUBLIC_API_URL` at build time via
`scripts/preview-api-url.sh` (called from `.github/workflows/web-preview.yml`).

There is no `railway.toml` in the repo. Service config lives in the Railway
dashboard (project `davar`, service `davar`).

## Branch model

| Railway environment | Git branch | Domain |
| --- | --- | --- |
| production | `main` | `https://davar-production-ecd0.up.railway.app` |
| staging | `staging` | `https://davar-staging.up.railway.app` |

`staging` is the integration branch. Feature PRs merge there before
promotion to `main`. Cloudflare previews always use the staging API
(`STAGING_API_URL`). They do not wait on Railway PR environments.

## PreviewApiTarget

| Source | URL |
| --- | --- |
| `railway-staging` | GitHub repo secret `STAGING_API_URL` |
| `fallback` | GitHub repo secret `PUBLIC_API_URL` |

`PUBLIC_*` values are inlined by `web/build.ts` (`define`), so the origin is
fixed per preview deploy.

## GitHub secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `STAGING_API_URL` | yes for previews | `https://davar-staging.up.railway.app` |
| `PUBLIC_API_URL` | fallback | Shared API origin if staging is unset |
| `CLOUDFLARE_API_TOKEN` | yes | Pages deploy |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Pages deploy |
| `RAILWAY_TOKEN` | yes for API staging deploys | Project token scoped to the staging environment |

```bash
gh secret set STAGING_API_URL --repo jhonnyisaacc/davar --body 'https://davar-staging.up.railway.app'
```

Production Pages (`davar.bible`) builds from Cloudflare's Git integration on
`main`, not from `web-preview.yml`. Set `PUBLIC_API_URL` in the Cloudflare
Pages **production** environment, or the client falls back to
`http://127.0.0.1:3000`.

## Railway settings (per environment)

Root directory `/api`. Watch patterns match the `api` filter in
`.github/ci/path-filters.yml` and `.github/workflows/railway-staging.yml`:

- `api/**`
- `shared/product*.ts`
- `contracts/biblical-knowledge/**`
- `data/knowledge/registries/**`

`railway-staging.yml` deploys a non-draft pull request that touches those
paths. It runs `railway up --service davar --environment staging` and waits
for `GET /up`. One deploy runs at a time, and a second deploy waits for it. Turn Railway's automatic pull
request environments off. The workflow skips with a notice when
`RAILWAY_TOKEN` is absent.

Hosted boot needs HTTPS `API_PUBLIC_URL` and exact-match `API_HOSTS`
(`api/src/lib/config.ts`). Staging is set to
`API_PUBLIC_URL=https://davar-staging.up.railway.app`,
`API_HOSTS=davar-staging.up.railway.app`, and `NODE_ENV=staging`.
`GET /up` on that domain returns `{"status":"ok"}` after restart.

CORS already allows `https://davar.bible` and `https://*.davar.pages.dev`
(`api/src/services/webOrigins.ts`).

## Live source

Production and staging both deploy GitHub repo `jhonnyisaacc/davar` with
root directory `/api`.

Cloudflare previews call `https://davar-staging.up.railway.app`. That
origin is the `STAGING_API_URL` secret. A preview does not create a
Railway environment.

## Known hosted gaps

- Railpack root `/api` omits repo `data/`. `loadBookIds()` reads
  `data/knowledge/registries/books.json` via `DAVAR_REPO_ROOT` or walked
  parents. Copy the registry into the image, change the build layout, or
  set `DAVAR_REPO_ROOT` if commentary validation throws `ENOENT`.
- No healthcheck path is configured. Re-adding `/up` requires that Host in
  `API_HOSTS`.

## Local check

```bash
STAGING_API_URL=https://davar-staging.up.railway.app \
  bash scripts/preview-api-url.sh
```
