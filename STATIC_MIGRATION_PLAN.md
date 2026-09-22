# Plan: Migrate Davar to Serverless Static Architecture

## ✅ MIGRATION COMPLETED

**Status:** All phases implemented successfully. Backend eliminated, static data serving from Cloudflare Pages, TS2009 via Supabase Storage.

**Completion Date:** March 2025

**Key Changes:**
- The FastAPI server is gone from this tree. Git history keeps the old code.
- All public data served as static JSON from Cloudflare Pages
- TS2009 licensed content moved to Supabase Storage
- Web app uses static data service layer with caching
- Mobile app downloads bundles from static URLs + Supabase for TS2009
- API keys and backend dependencies removed

## TL;DR

Remove the FastAPI backend entirely. Serve all public data (OE/Masoretic, Delitzsch/Besorah, DSS, dictionary, prefixes, TTH, BES, translit) as static JSON from Cloudflare Pages. Keep TS2009 in Supabase Storage (licensed, private). Web fetches static JSON files directly. Mobile keeps its existing offline-first SQLite pattern but downloads bundles from static URLs + Supabase for TS2009.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CURRENT STATE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐         ┌─────────────┐         ┌──────────┐ │
│   │  Web App    │◄────────┤   Backend   │◄────────│  Data    │ │
│   │  (Bun)      │   HTTP  │  (FastAPI)  │   File  │  Folder  │ │
│   └─────────────┘         └─────────────┘         └──────────┘ │
│                                  │                              │
│   ┌─────────────┐                │         ┌──────────────┐    │
│   │ Mobile App  │◄───────────────┘         │  Supabase    │    │
│   │  (Expo)     │         HTTP             │  (TS2009)    │    │
│   └─────────────┘                          └──────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       TARGET STATE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────────────────────────────────────────┐     │
│   │              UNIFIED DATA PIPELINE                    │     │
│   │  ┌─────────────┐    ┌─────────────┐    ┌─────────┐  │     │
│   │  │  Raw Data   │───►│  Generator  │───►│ Bundles │  │     │
│   │  │  (data/)    │    │ (scripts/)  │    │ (JSON)  │  │     │
│   │  └─────────────┘    └─────────────┘    └────┬────┘  │     │
│   └─────────────────────────────────────────────┼────────┘     │
│                                                 │               │
│                        ┌────────────────────────┘               │
│                        │                                        │
│            ┌───────────┴────────────┐                          │
│            ▼                        ▼                          │
│ ┌─────────────────────┐  ┌─────────────────────────┐          │
│ │   Cloudflare Pages  │  │  Mobile downloads from   │          │
│ │   (web/public/data) │  │  Cloudflare static URLs  │          │
│ └──────────┬──────────┘  └──────────┬──────────────┘          │
│            │                        │                          │
│ ┌──────────▼──────────┐  ┌──────────▼──────────┐              │
│ │   Web App           │  │   Mobile App        │              │
│ │   (fetch + cache)   │  │   (SQLite offline)  │              │
│ └──────────┬──────────┘  └──────────┬──────────┘              │
│            │                        │                          │
│            └────────────┬───────────┘                          │
│                         ▼                                      │
│              ┌──────────────────┐                              │
│              │  Supabase        │                              │
│              │  (TS2009 only)   │                              │
│              └──────────────────┘                              │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Data Pipeline Flow

```
data/                  ← single source of truth (committed to git)
    ↓  bun run generate-data (build-time)
web/public/data/       ← generated static JSON (gitignored)
    ↓  deploy
Cloudflare Pages       ← served globally via CDN (free)

Supabase Storage       ← TS2009 only (licensed, private, anon key + RLS)
```

## Data Inventory

| Dataset | Size | Public? | New Location |
|---------|------|---------|-------------|
| OE (Masoretic/Tanaj) | 22 MB | Yes | Static `web/public/data/oe/` |
| Delitzsch (Besorah) | ~7 MB | Yes | Static `web/public/data/besorah/` |
| DSS variants | 244 KB | Yes | Static `web/public/data/dss/` |
| Dictionary (words 12 MB, roots 168 KB, custom defs 12 KB) | ~12 MB | Yes | Static `web/public/data/dict/` |
| Prefixes | 4 KB | Yes | Static `web/public/data/prefixes.json` |
| Transliterations | 28 KB | Yes | Static `web/public/data/translit/` |
| TTH (Spanish) | 12 MB | Yes | Static `web/public/data/tth/` |
| BES (Spanish fallback) | 1.1 MB | Yes | Static `web/public/data/bes/` |
| **TS2009 (English)** | **12 MB** | **No (licensed)** | **Supabase Storage** |
| **Total public** | **~54 MB raw** | | ~10-15 MB gzipped on CDN |

## API Endpoints Replaced

| Current Endpoint | Replacement |
|-----------------|-------------|
| `GET /health` | Eliminated (no server) |
| `GET /api/v1/books` | Static `metadata.json` |
| `GET /api/v1/books/{book}/chapters` | Derived from `metadata.json` |
| `GET /api/v1/books/{book}/chapters/{ch}/verses` | Derived from static chapter files |
| `GET /api/v1/verses/{book}/{chapter}` | Static `/data/oe/{book}/{ch}.json` + translation merge |
| `GET /api/v1/lexicon/{strong}` | Client-side lookup from cached dictionary |
| `GET /api/v1/search?q=...` | Client-side search (MiniSearch) |
| `GET /api/v1/prefixes/{id}` | Static `prefixes.json` (loaded once, 4 KB) |
| `GET /api/v1/metadata/preload` | Static `metadata.json` |
| `GET /api/v1/export/versions` | Static `bundles/versions.json` |
| `GET /api/v1/export/bundle/{dataset}` | Static files (public) / Supabase (TS2009) |

---

## Implementation Phases

### Phase 1: Unified Data Pipeline

**1.1** Create `scripts/generate-static-data/` — a shared Bun script that generates data for both web and mobile:

```
scripts/generate-static-data/
├── index.ts              # Main orchestrator
├── config.ts             # Paths, book mappings, version numbers
├── generators/
│   ├── metadata.ts       # Books, chapters, verse counts
│   ├── hebrew.ts         # OE/Masoretic + Delitzsch processing
│   ├── translations.ts   # TTH + BES processing
│   ├── lexicon.ts        # Dictionary/words/roots processing
│   ├── dss.ts            # DSS variant processing
│   └── prefixes.ts       # Prefix definitions
├── outputs/
│   ├── web.ts            # Write web-format files to web/public/data/
│   └── mobile.ts         # Write mobile-format bundles to web/public/data/bundles/
└── manifest.ts           # Generate manifest.json with checksums
```

**Output structure** (all written to `web/public/data/`):

| Output Path | Source | Format |
|------------|--------|--------|
| `manifest.json` | Generated | Version, checksums, sizes for all bundles |
| `metadata.json` | All book folders + chapter files | Books list, chapter counts, verse counts |
| `oe/{book}/{chapter}.json` | `data/oe/{book}/{chapter}.json` | Per-chapter Hebrew verses with word data |
| `besorah/{book}/{chapter}.json` | `data/delitzsch_parsed/` | Per-chapter Delitzsch verses |
| `tth/{book}.json` | `data/tth_2/json/` | Per-book TTH Spanish translation |
| `bes/{book}.json` | `data/bes/json/` | Per-book BES Spanish fallback |
| `dss/{book}.json` | `data/dss/books/` | Per-book DSS variants |
| `dict/words.json` | `data/dict/lexicon/words.json` | Full dictionary (minified) |
| `dict/roots.json` | `data/dict/lexicon/roots.json` | Root definitions |
| `dict/custom_definitions.json` | `data/dict/lexicon/custom_definitions.json` | Custom definitions |
| `prefixes.json` | `data/dict/prefixes/entries/*.json` | All prefixes (single 4 KB file) |
| `translit/{book}.json` | `data/translit/` | Per-book transliterations |
| `bundles/versions.json` | Version numbers from config | Mobile bundle version tracking |
| `bundles/{tanaj,besorah,tth,dictionary,dss}.json` | Aggregated from sources | Mobile-format bundles (matches existing export format) |

**Why per-chapter for OE/Besorah:** These are the largest datasets. Loading only the current chapter keeps initial payload small (~50-200 KB). Other datasets are per-book (small enough to lazy-load).

**1.2** Manifest schema (`manifest.json`):
```json
{
  "version": "2026.03.24-1",
  "generated_at": "2026-03-24T17:00:00Z",
  "bundles": {
    "metadata": { "size": 45000, "checksum": "sha256:abc123..." },
    "oe": { "books": 39, "total_size": 22000000, "checksum": "sha256:..." },
    "besorah": { "books": 27, "total_size": 7000000, "checksum": "sha256:..." },
    "tth": { "books": 66, "total_size": 12000000, "checksum": "sha256:..." },
    "dict": { "total_size": 12200000, "checksum": "sha256:..." },
    "dss": { "total_size": 244000, "checksum": "sha256:..." },
    "prefixes": { "size": 4000, "checksum": "sha256:..." }
  }
}
```
The manifest enables both web and mobile to verify data integrity after download, and detect when new data is available.

**1.3** Add `generate-data` script to root `package.json` and `web/package.json`, wire into `build` and `build:prod`.

**1.4** Add `web/public/data/` to `.gitignore` (generated files, not committed).

---

### Phase 2: Static Data Service Layer (web)

**2.1** Create `web/src/app/services/staticData.ts` — replaces all API calls with static file fetches:

```typescript
// Key functions (all return existing TypeScript types):
loadMetadata()                          // → fetch('/data/metadata.json'), cached in memory
loadChapterVerses(book, chapter, opts)  // → fetch('/data/oe/{book}/{ch}.json') + merge translation
loadTranslation(book, chapter, verse, language)  // → cached per-book TTH/BES or Supabase TS2009
loadLexiconEntry(strong, language)      // → lookup from cached dictionary (loaded on first use)
searchLexicon(query)                    // → client-side MiniSearch over dictionary
loadPrefix(prefixId)                    // → from cached prefixes.json (loaded once)
loadDssVariants(book)                   // → fetch('/data/dss/{book}.json'), cached
```

Each function uses a simple in-memory `Map` cache and returns the same types as current services (`VerseResponse`, `BookResponse`, `WordAnalysis`, etc.).

**2.2** Create `web/src/app/services/supabaseClient.ts` — minimal Supabase client for TS2009 only:
- `@supabase/supabase-js` with anon key from env var
- `fetchTs2009Translation(book, chapter, verse)` → reads from Supabase Storage bucket `ts2009`
- Called only when `language === 'en'`

**2.3** Wire TS2009 into verse assembly: when `language === 'en'`, `staticData` fetches Hebrew from static files + TS2009 from Supabase and merges them into `VerseResponse`.

---

### Phase 3: Replace API Calls in Web App

**3.1** Update `web/src/app/App.tsx`:
- Replace `import { getBooks, getChapterVerses, ... } from './services/verseService'` → static data functions
- Replace `import { getWordAnalysisByStrong, searchWordAnalysis } from './services/lexiconService'` → static data functions
- Remove `warmUpApiConnection()` call (no server to warm up)

**3.2** Update `web/src/app/components/WordCard.tsx`:
- Replace `apiRequest('/api/v1/prefixes/...')` with `loadPrefix(prefixId)` from staticData

**3.3** Remove replaced modules:
- `web/src/app/services/apiClient.ts` — delete (no backend API)
- `web/src/app/services/verseService.ts` — replaced by staticData.ts
- `web/src/app/services/lexiconService.ts` — replaced by staticData.ts
- `web/functions/api/[[path]].ts` — delete (no backend to proxy)
- `web/src/app/services/apiClient.connectivity.test.js` — rewrite

---

### Phase 4: Web Build & Deploy Config

**4.1** Update `web/wrangler.toml`:
- Remove `connect-src https://api.davar.bible` from CSP
- Add `connect-src 'self' https://*.supabase.co` for TS2009 fetches
- Delete `web/functions/` directory (no more Cloudflare Functions)

**4.2** Update `web/build.ts` to run `generate-data` before building.

**4.3** Add Supabase env vars to Cloudflare Pages dashboard:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

**4.4** Update `.env` / `.env.production`:
- Remove: `PUBLIC_API_BASE_URL`, `PUBLIC_API_KEY`
- Add: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`

**4.5** Optional: Add Service Worker for offline web caching.
- Cache loaded chapter/book JSON in a Cache Storage bucket
- On subsequent visits, serve cached data instantly (cache-first, network-update strategy)
- Users who frequently study the same passages get instant loads even offline
- Can be added post-launch as a progressive enhancement

---

### Phase 5: Mobile App Updates

**5.1** Update download URLs in `mobile/src/services/offlineSync.ts`:

| Bundle | Old Source | New Source |
|--------|-----------|-----------|
| tanaj | `GET /api/v1/export/bundle/tanaj` | `https://davar.bible/data/bundles/tanaj.json` (index) + `https://davar.bible/data/bundles/tanaj/{book}.json` |
| besorah | `GET /api/v1/export/bundle/besorah` | `https://davar.bible/data/bundles/besorah.json` |
| dictionary | `GET /api/v1/export/bundle/dictionary` | `https://davar.bible/data/bundles/dictionary.json` |
| dss | `GET /api/v1/export/bundle/dss` | `https://davar.bible/data/bundles/dss.json` |
| tth | `GET /api/v1/export/bundle/tth` | `https://davar.bible/data/bundles/tth.json` |
| **ts2009** | `GET /api/v1/export/bundle/ts2009` | **Supabase Storage** |
| versions | `GET /api/v1/export/versions` | `https://davar.bible/data/bundles/versions.json` |

**5.2** Add `@supabase/supabase-js` to `mobile/package.json` (`bun add @supabase/supabase-js` in `mobile/`).

**5.3** Update `mobile/src/services/offlineSync.ts`:
- Download public bundles from static Cloudflare URLs (simple `fetch()`, no auth headers)
- Download TS2009 from Supabase Storage via SDK
- Keep existing SQLite ingestion pipeline unchanged

**5.4** Update `mobile/src/services/api.ts`:
- Online mode: fetch from static URLs for verses/lexicon, or use local SQLite first
- Remove API key headers for public data
- Add Supabase client for TS2009

**5.5** Remove `EXPO_PUBLIC_API_KEY` env var from mobile configs.

---

### Phase 6: Cleanup

**6.1** Delete `web/functions/` directory entirely.

**6.2** Remove `PUBLIC_API_BASE_URL` and `PUBLIC_API_KEY` env vars from all configs.

**6.3** Rewrite `web/src/app/services/apiClient.connectivity.test.js` for static data + Supabase.

**6.4** Update `.github/instructions/davar.instructions.md` — replace "Backend: FastAPI + PostgreSQL" with "Static data on Cloudflare Pages + Supabase Storage for TS2009".

**6.5** Archive `backend/` directory (not deleted immediately — keep for reference during validation).

---

## Files Affected

### Scripts — Create
| File | Purpose |
|------|---------|
| `scripts/generate-static-data/index.ts` | Main orchestrator |
| `scripts/generate-static-data/config.ts` | Paths, mappings, versions |
| `scripts/generate-static-data/generators/*.ts` | Data type generators |
| `scripts/generate-static-data/outputs/*.ts` | Platform-specific writers |
| `scripts/generate-static-data/manifest.ts` | Manifest + checksum generation |

### Web — Create
| File | Purpose |
|------|---------|
| `web/src/app/services/staticData.ts` | New static data access layer |
| `web/src/app/services/supabaseClient.ts` | Supabase client for TS2009 |

### Web — Modify
| File | Change |
|------|--------|
| `web/src/app/App.tsx` | Replace API imports with staticData functions |
| `web/src/app/components/WordCard.tsx` | Replace prefix API call with static lookup |
| `web/build.ts` | Integrate prepareData into build pipeline |
| `web/package.json` | Add scripts + deps (`@supabase/supabase-js`, `minisearch`) |
| `web/wrangler.toml` | Update CSP for Supabase, remove functions reference |

### Web — Delete
| File | Reason |
|------|--------|
| `web/functions/api/[[path]].ts` | No backend to proxy |
| `web/src/app/services/apiClient.ts` | Replaced by staticData |
| `web/src/app/services/verseService.ts` | Replaced by staticData |
| `web/src/app/services/lexiconService.ts` | Replaced by staticData |

### Mobile — Modify
| File | Change |
|------|--------|
| `mobile/src/services/api.ts` | Static URLs + Supabase instead of backend |
| `mobile/src/services/offlineSync.ts` | Update download sources |
| `mobile/package.json` | Add `@supabase/supabase-js` |

### Backend — Archive
| Directory | Action |
|-----------|--------|
| `backend/` | Keep for reference, stop deploying |

---

## Verification Checklist

### Data Integrity (run by `bun run generate-data`)
1. [ ] All 39 Tanaj books generated with correct chapter counts
2. [ ] All 27 Besorah books generated with correct chapter counts
3. [ ] `manifest.json` generated with checksums matching actual files
4. [ ] Schema validation: generated JSON matches TypeScript types (`VerseResponse`, `BookResponse`, `WordAnalysis`, etc.)
5. [ ] Size report printed — totals match expected ranges

### Web Functional
6. [ ] `bun run dev` in `web/` **with backend OFF** — navigate books, chapters, verses, word analysis, DSS variants, prefixes
7. [ ] English translation (TS2009) loads from Supabase when `language=en`
8. [ ] Spanish translation (TTH) loads from static files when `language=es`
9. [ ] Lexicon search works client-side (MiniSearch)
10. [ ] `bun test` in `web/` — rewritten tests pass

### Web Deploy
11. [ ] Deploy to Cloudflare Pages preview — full end-to-end test
12. [ ] No `api.davar.bible` or backend calls visible in browser network tab
13. [ ] Static files served with correct `Cache-Control` headers
14. [ ] Supabase TS2009 requests succeed with anon key

### Mobile Functional
15. [ ] `bunx expo start` — app loads books and verses from static URLs
16. [ ] Offline sync downloads public bundles from Cloudflare static URLs
17. [ ] TS2009 bundle downloads from Supabase Storage
18. [ ] Offline mode works after sync (SQLite queries, no network)

### Final
19. [ ] `backend/` server is NOT running during any of the above tests
20. [ ] All env vars updated (Cloudflare Pages, mobile configs, `.env` files)

---

## Rollback Plan

If issues arise after deployment:

1. **Immediate (minutes)**: Revert the Cloudflare Pages deploy to the previous version in the Cloudflare dashboard (Deployments, then rollback). The FastAPI server is not in this tree. Restore it from git history before a redeploy.
2. **Short-term (hours)**: Re-enable backend proxy by restoring `web/functions/api/[[path]].ts` and redeploying. Old env vars (`PUBLIC_API_BASE_URL`, `PUBLIC_API_KEY`) can be re-added to Cloudflare Pages.
3. **Mobile**: Mobile app downloads are idempotent — if new URLs fail, the app falls back to its existing SQLite cache. Users who already synced continue working offline.

Git history keeps the FastAPI server, so a rollback to that architecture is still possible.

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **TS2009 in Supabase only** | Licensed by ISR — cannot be served publicly. Anon key + RLS for read-only access. |
| **TTH as public static files** | Can be served without auth protection. |
| **Full switchover (no backend fallback)** | Clean break, simpler architecture, no dual maintenance. |
| **Client-side lexicon search** | Dictionary is ~12 MB — acceptable for browser. MiniSearch is ~7 KB gzipped. Lazy-loaded on first lexicon interaction. |
| **Per-chapter splitting for OE/Besorah** | Keeps each fetch small (~50-200 KB). Other datasets loaded per-book. |
| **Mobile SQLite pipeline unchanged** | Only download URLs change. Existing ingestion, caching, and offline queries stay the same. |
| **Static `versions.json` for mobile bundles** | Simpler than Supabase table. Bumping versions requires a web redeploy, but data updates are infrequent. |
| **`data/` stays at project root** | Single source of truth. Edit data there; `bun run build` generates static output. |
| **No new features in scope** | This migration replaces the backend with static serving. User accounts, annotations, sync are future work. |

---

## Supabase Security Notes

- The Supabase **anon key** will be visible in browser JS — this is expected and safe with proper RLS.
- Set up Supabase Storage bucket policies so the anon key can **only read** the `ts2009` bucket (no list, no write, no delete).
- The TS2009 data is served per-file (per book JSON), so a user can only access one book at a time — consistent with ISR license terms (API ≤100 verses per request).

---

## Future Considerations

1. **Service Worker for web offline** — Cache loaded chapter/book JSON in Cache Storage. Users who study the same passages frequently get instant loads, even offline. Implement as progressive enhancement post-launch.
2. **Dictionary chunking** — If 12 MB `words.json` causes memory issues on low-end devices, split into per-range files (e.g., `H0001-H1000.json`). Start with single file; optimize if needed.
3. **Mobile bundle version tracking** — If independent version bumps (without web redeploy) become important, move `versions.json` to a Supabase table row.
4. **User data (future)** — When adding annotations, highlights, bookmarks, and cross-device sync: use Supabase PostgreSQL + Auth. This plan does not affect that future work.
5. **BES deprecation** — BES is a Spanish fallback (1.1 MB). If TTH covers all books, BES may become unnecessary over time.
