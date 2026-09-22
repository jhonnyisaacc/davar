
# Web App for Davar

This is the web application package for Davar.

## Running the code

Run `bun install` to install dependencies.

For Cloudflare Pages, this package is intended to build with Bun from the
`web/` directory. Set your Pages project's **Build command** to `bun run build`
and **Root directory** to `web`. Set the environment variable `SKIP_DEPENDENCY_INSTALL=1`
so Pages does not run its own npm install (the `build` script installs dependencies itself). Do not pin `BUN_VERSION` by default.
See [CLOUDFLARE_DEPLOYMENT_GUIDE.md](../docs/CLOUDFLARE_DEPLOYMENT_GUIDE.md) for the
full required dashboard settings and the exact troubleshooting for
"Could not resolve: react-dom/client" build failures.

Run `bun run dev` for Bun HTML hot-reload mode without running `build.ts`.
It keeps the app on `http://localhost:3002`, checks static data, runs Bun HTML mode on an internal port, and serves `/data/*.json` through a local gateway.
The gateway listens on `0.0.0.0` by default so mobile devices on the same LAN can use `http://<your-machine-ip>:3002`.

Run `bun run dev:static` for production-parity local serving (builds `dist/` once, then serves it).

### Startup Logs

When using `bun run dev`, startup logs now show high-level milestone phases:

- `[davar-web] phase=data-generation start|done`
- `[davar-web] phase=bundle start|done`
- `[davar-web] phase=assets done`
- `[davar-web] phase=build done`

`[davar-static-data]` logs mark static-data generation start/end with total duration.

## Environment Setup

Web TS2009 translation loading is now served through the same-origin
`/api/ts2009/*` Pages Function backed by the private Cloudflare R2 bucket
`ts2009`.

Production builds also keep a bundled `/data/ts2009/*` fallback so English
verses can still render if the Pages Function binding is unavailable.

The web client no longer needs public Supabase credentials for TS2009.

### TS2009 Storage And Upload

Production flow:

1. Keep the source files in `data/ts2009/`.
2. Upload them to the private R2 bucket with `bun run upload:ts2009:r2` from `web/`.
	The uploader is resumable and skips files that were already uploaded.
3. Deploy the web app through the existing GitHub -> Cloudflare Pages flow.

At runtime:

- The browser requests `/api/ts2009/<book>.json` first.
- The Pages Function reads that object from the private `TS2009_BUCKET` binding.
- If that request fails, the client falls back to bundled `/data/ts2009/<book>.json` when present.
- In Cloudflare Pages, configure `TS2009_BUCKET` in both Preview and Production under Settings > Bindings, then redeploy after any binding change.

For local Bun development:

- `bun run dev` and `bun run serve` expose the same `/api/ts2009/*` path.
- Those local routes read directly from `data/ts2009/` on disk — **not** from the Cloudflare R2 bucket.
- Setting `PUBLIC_STATIC_URL` to a deployed URL does not proxy TS2009: `/api/*` requests always stay same-origin.

### Testing dev with production TS2009 (R2) data

Use one of these approaches depending on whether you need hot reload or live R2 reads.

#### Option 1: `wrangler pages dev` (real R2, closest to production)

Runs the built app with the same Pages Function that reads R2 in production (`/api/ts2009/*`).

From `web/`:

1. Log in: `bunx wrangler login`
2. Build: `bun run build:prod`
3. Create a local `wrangler.toml` (this file is gitignored) with a remote R2 binding:

```toml
name = "davar-web"
compatibility_date = "2025-05-25"
pages_build_output_dir = "dist"

[[r2_buckets]]
binding = "TS2009_BUCKET"
bucket_name = "ts2009"
remote = true
```

`remote = true` uses the real `ts2009` bucket on Cloudflare (not local simulation). Requires Wrangler 4.37+.

4. Start preview: `bunx wrangler pages dev dist`

Open the URL Wrangler prints (often `http://localhost:8788`).

**Tradeoff:** No `bun run dev` hot reload — rebuild when UI code changes.

Without `wrangler.toml`, you can pass the binding on the CLI (may use local R2 simulation unless `remote = true` is in config):

```bash
bunx wrangler pages dev dist --r2=TS2009_BUCKET=ts2009
```

#### Option 2: Hot reload with a local copy of R2 data

`bun run dev` and `bun run serve` only read `data/ts2009/`. Sync production objects into that folder, then run dev as usual:

```bash
cd web
bunx wrangler r2 object get ts2009/matthew.json --file=../data/ts2009/matthew.json
```

Repeat per book file, or script downloads from your bucket listing. Then:

```bash
bun run dev
# or: bun run build:prod && bun run serve
```

**Tradeoff:** Data is a snapshot until you sync again.

#### Option 3: Use the deployed site

Open your live or preview Pages URL (with `TS2009_BUCKET` configured). That is the full production stack — best for confirming deploy + R2 after release.

#### Quick reference

| Goal | Approach |
|------|----------|
| Real R2 + same `/api/ts2009` as prod | Option 1 (`wrangler pages dev` + `remote = true`) |
| `bun run dev` hot reload with prod text | Option 2 (sync R2 → `data/ts2009/`) |
| Verify deploy and R2 bindings | Option 3 (deployed URL) |

## Formatting

- This workspace uses Biome as the formatter/linter source of truth for JS/TS files.
- Use `bun run format` in this `web/` directory to format files.
- Prettier is intentionally not configured at project level in this workspace.
  
