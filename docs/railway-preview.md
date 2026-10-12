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

```bash
gh secret set STAGING_API_URL --repo jhonnyisaacc/davar --body 'https://davar-staging.up.railway.app'
```

Production Pages (`davar.bible`) builds from Cloudflare's Git integration on
`main`, not from `web-preview.yml`. Set `PUBLIC_API_URL` in the Cloudflare
Pages **production** environment, or the client falls back to
`http://127.0.0.1:3000`.

## Railway settings (per environment)

Root directory `/api`. Watch patterns match `api-ci.yml`:

- `api/**`
- `shared/product*.ts`
- `contracts/biblical-knowledge/**`
- `data/knowledge/registries/**`

Hosted boot needs HTTPS `API_PUBLIC_URL` and exact-match `API_HOSTS`
(`api/src/lib/config.ts`). Staging should use
`API_PUBLIC_URL=https://davar-staging.up.railway.app` and
`API_HOSTS=davar-staging.up.railway.app`, with `NODE_ENV=staging`.

CORS already allows `https://davar.bible` and `https://*.davar.pages.dev`
(`api/src/services/webOrigins.ts`).

## Live leftovers to clear

Production and staging **live** config may still show the old GitHub slug
`edyhvh/davar` and root `/server` until you accept the staged patch that
moves them to `jhonnyisaacc/davar` and `/api`. Those are Hono-era path
names from the Rails→Hono move, not Ruby variables. Accept **staging**
once `staging` has `api/`. Accept **production** only after `api/` is on
`main`.

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
