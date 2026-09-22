# Cloudflare Pages Deployment Guide

This guide explains how to deploy the Davar web frontend to Cloudflare Pages on the free tier.

## ✅ Updated Architecture (Post-Migration)

**Status:** Backend eliminated. Now a static-first site with:
- Static JSON data served from Cloudflare Pages
- TS2009 served through a same-origin Pages Function backed by R2
- Bundled TS2009 static fallback available in the build output
- No separate backend server required

### New Flow:
1. Browser loads frontend from Cloudflare Pages
2. Frontend fetches core static JSON data from same origin (`/data/`)
3. For TS2009, the frontend requests `/api/ts2009/<book>.json`
4. The Pages Function reads that object from the `TS2009_BUCKET` R2 binding
5. If the binding path is unavailable, the client can fall back to bundled `/data/ts2009/...`

### Benefits:
- **Zero cold starts** - no server to wake up
- **Global CDN** - instant worldwide loading
- **Free tier** - unlimited bandwidth for static content
- **Same-origin TS2009 access** - no browser-side third-party credentials

---

## 1. Cloudflare Navigation

Cloudflare has two relevant areas:

- **Workers & Pages**: deployment, build config, environment variables, custom domain for Pages project
- **Zone Dashboard**: domain-level DNS and security controls

---

## 2. Create the Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Open **Workers & Pages**
3. Click **Create application**
4. Choose **Pages** and **Connect to Git**
5. Select this repository
6. Configure build:
   - Project name: `davar-web`
   - Production branch: `main`
   - Root directory: `web`
   - Build command: `bun run build` (or `bun run build:prod` / `bun run build:cf` for production env file)
   - Build output directory: `dist`
7. Save and deploy

**IMPORTANT:** Set **Root directory** to `web` in the Cloudflare Pages dashboard (Settings → Build settings).
The `build` script runs `bun install --frozen-lockfile` before bundling, so
`SKIP_DEPENDENCY_INSTALL=1` (recommended) does not leave you without `node_modules`.

If Pages logs show `Installing project dependencies: npm install --progress=false`,
set `SKIP_DEPENDENCY_INSTALL=1` in the Pages project and redeploy. This repo is
designed to install and build with Bun from the `web/` directory.

---

## 3. Configure Pages Environment Variables

In your Pages project settings, add production environment variables:

```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
PUBLIC_NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SKIP_DEPENDENCY_INSTALL=1
```

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` is build-time only and must never be public
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` enable TS2009 static export at build time
- Public Supabase vars can remain for compatibility, but the web app should read same-origin TS2009 data
- `SKIP_DEPENDENCY_INSTALL=1` prevents Cloudflare Pages from running `npm install` before the build (we explicitly run `bun install` as part of the `build:cf` Build command)
- These values are applied at build time
- No separate backend API origin is needed for TS2009

Use the default Bun runtime provided by Cloudflare Pages unless you are working
around a confirmed platform regression. The stable fix for this repo is to skip
Pages' automatic dependency install and run the Bun install/build explicitly.

Also configure the Pages binding for runtime TS2009 reads:

1. Open **Workers & Pages** -> your Pages project -> **Settings** -> **Bindings**
2. Add an **R2 bucket** binding named `TS2009_BUCKET`
3. Select the `ts2009` bucket
4. Repeat for both **Production** and **Preview** environments
5. Redeploy after any binding change

---

## 4. Add Custom Domain

1. In Pages project, open **Custom domains**
2. Add your domain (example: `davar.bible`)
3. Complete DNS prompts until status is active

---

## 5. Data Serving

Static data is automatically served from `/data/` paths on your domain. No additional configuration needed.

**Example URLs:**
- `https://davar.bible/data/metadata.json`
- `https://davar.bible/data/oe/genesis/1.json`
- `https://davar.bible/data/tth/genesis.json`
- `https://davar.bible/data/ts2009/genesis/1.json`

- Proxies `/api/*` requests to `BACKEND_API_ORIGIN`
- Caches selected GET/HEAD endpoints at the edge
- Adds `X-Davar-Edge-Cache: HIT|MISS` for observability

---

## 7. Update Backend CORS in Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Open backend service `davar`
3. Go to **Environment**
4. Update `DAVAR_ALLOWED_ORIGINS`
5. Use exact origins only

Example:

```bash
DAVAR_ALLOWED_ORIGINS=["http://localhost:3002","http://localhost:3003","http://localhost:8082","https://app.yourdomain.com"]
```

Then redeploy backend.

Because frontend is now same-origin to Pages, Render only needs to allow the Pages/Custom-domain origin and local dev origins.

---

## 8. Security Settings (Free Tier)

In Zone dashboard:

1. **SSL/TLS** -> **Overview** -> set mode to `Full (strict)`
2. **Security** -> **Bots** -> enable **Bot Fight Mode**
3. **Security** -> **WAF** -> optionally add managed/custom rules
4. **Security** -> **Settings** (or **Rate Limiting**) -> create one API rule

Suggested API limit baseline:

- Path: `/api/*`
- Threshold: `10 requests / 10 seconds` per client

Tune this after observing real traffic.

---

## 9. Build and Verification

### Local build check (matches Cloudflare production command)

```bash
cd web
bun run build:cf
# or the long form:
# bun install --frozen-lockfile && bun --env-file=.env.production run build
```

### Optional local Pages preview

```bash
cd web
bunx wrangler pages dev dist
```

### Deployment verification checklist

1. Pages deployment is healthy in **Workers & Pages**
2. Custom domain is active and serving frontend
3. `TS2009_BUCKET` is configured in both Preview and Production bindings
4. Browser API calls go to `/api/...` on your Pages domain
5. API responses are `200` or the bundled `/data/ts2009/...` fallback is present
6. No CORS errors in browser console
7. No CSP connect-src errors in browser console
8. Direct navigation to deep routes still loads app (SPA fallback)
9. Response headers include `X-Davar-Edge-Cache` for cacheable reads

---

## 10. Files Already Present in This Repo

- [web/.env.production](web/.env.production)
- [web/wrangler.toml](web/wrangler.toml)
- [web/public/\_redirects](web/public/_redirects)
- [plans/cloudflare-deployment-plan.md](plans/cloudflare-deployment-plan.md)

---

## 11. Troubleshooting

### CORS blocked

1. Confirm exact frontend origin exists in `DAVAR_ALLOWED_ORIGINS`
2. Confirm backend was redeployed after env change
3. Confirm browser is using expected domain (not preview URL)

### API calls bypass proxy

1. Confirm `PUBLIC_API_BASE_URL=/api` in Pages environment variables
2. Confirm Pages Function exists at `web/functions/api/[[path]].ts`
3. Rebuild/redeploy Pages after env changes

### API calls fail or go to wrong host

1. Confirm `PUBLIC_API_BASE_URL=/api` in Pages environment variables
2. Confirm `BACKEND_API_ORIGIN=https://davar.onrender.com` in Pages environment variables
3. Rebuild/redeploy Pages after variable changes
4. Check network tab request URL host

### Build fails (e.g. "Could not resolve: react-dom/client" during phase=bundle)

This is the most common failure when `SKIP_DEPENDENCY_INSTALL=1` is set.

**Symptom (exact log from a recent incident):**
```
[davar-web] phase=bundle start
1 | import { createRoot } from "react-dom/client";
                               ^
error: Could not resolve: "react-dom/client". Maybe you need to "bun install"?
...
[davar-web] phase=bundle failed
```

**Root cause:** `SKIP_DEPENDENCY_INSTALL=1` told Pages to skip its auto `npm install`.  
Your **Build command** in the dashboard did not include an explicit Bun install step,  
so `web/node_modules/` was empty (or stale after a package.json change), and Bun.build  
could not resolve the app's runtime dependencies (react, react-dom, mui, radix, etc.).

**Fix (apply in Cloudflare dashboard):**

1. Go to **Workers & Pages** → your `davar-web` project → **Settings** → **Build settings** → **Edit**
2. Set **exactly**:
   - Root directory: `web`
   - Build command: `bun run build:cf`
   - Build output directory: `dist`
3. In **Environment variables** (both Production and Preview), ensure:
   ```
   SKIP_DEPENDENCY_INSTALL=1
   ```
   (plus the other SUPABASE_* and PUBLIC_* vars)
4. Save → **Save and Deploy** (or push a new commit to trigger).

After this change, every build will explicitly run `bun install --frozen-lockfile` (via the `build:cf` script) before bundling, even with SKIP enabled.

**Local reproduction of the exact CF command:**
```bash
cd web
bun run build:cf
```

Other build-failure checks:
- Re-run the local check above.
- Confirm no `BUN_VERSION` override is pinned (unless you have a known-good reason).
- After any `package.json` or `bun.lock` change, a fresh `bun install` locally + the CF rebuild is required.

---

## 12. Support Path

If deployment fails:

1. Check **Workers & Pages** deployment logs first
2. Check Zone-level security/rule events in Cloudflare
3. Check Render service logs

---

## 13. Preview Lifecycle and Deployment Statuses

Cloudflare preview deployments are expected for pull requests that modify web files.

Normal lifecycle events:

1. PR opened or updated: a new preview deployment is created.
2. New commit pushed to same PR: previous preview can be superseded and shown as inactive.
3. PR merged or closed: preview deployment can be removed or marked destroyed.

Important interpretation:

- A preview marked destroyed after merge/close is usually expected cleanup, not a production failure.
- Production health should be validated on the `main` deployment and custom domain, not on expired preview URLs.

Canonical ownership for this repository:

1. Cloudflare Pages is the only frontend deployment owner.
2. Render is the backend deployment owner.
3. Vercel deployment integration should remain disabled to avoid duplicate preview and production statuses.
