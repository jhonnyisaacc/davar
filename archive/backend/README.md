# Davar FastAPI Backend (ARCHIVED)

**Status:** This backend has been eliminated as part of the static data migration. All functionality moved to static JSON files served from Cloudflare Pages + Supabase Storage for TS2009.

**Archived Date:** March 2025

**Reason:** Eliminated to reduce infrastructure complexity and costs. Replaced with serverless static data architecture.

---

A secure FastAPI backend for serving Hebrew Scripture text, translations, lexicon data, and DSS variants from JSON files.

## Features

- **API Key Authentication**: Secure access with configurable API keys
- **Hebrew Scripture Data**: Tanaj (OE) and Besorah (Delitzsch) texts
- **Translations**: TTH (Spanish) and TS2009 (English)
- **DSS Variants**: DSS manuscript variants
- **Lexicon**: Custom definitions with Strong's/BDB fallback
- **Caching**: In-memory caching with memory safeguards
- **Rate Limiting**: Configurable request limits
- **CORS Support**: Configurable cross-origin access

## Quick Start

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your API key and settings
   ```

3. Run the server:
   ```bash
   uvicorn app.main:app --reload
   // or use
   fastapi dev --port 2220
   ```

## API Endpoints

- `GET /api/v1/books` - List all books with metadata
- `GET /api/v1/verses/{book}/{chapter}` - Get verses with translations
- `GET /api/v1/lexicon/{strong}` - Get word definitions
- `GET /api/v1/prefixes/{id}` - Get prefix meanings

## Development

The backend serves data from the `../data` directory containing:

- OE Hebrew texts (Tanaj)
- Delitzsch Hebrew texts (Besorah)
- TTH Spanish translations (tth format: one JSON file per book with hierarchical structure)
- TS2009 English translations
- DSS variants
- Custom lexicon and prefixes

### TTH Data Structure (tth)

The TTH Spanish translations now use an optimized format with one JSON file per book:

```json
{
  "book_info": {
    "book_id": "amos",
    "tth_name": "Amós",
    "hebrew_name": "עמוס",
    "english_name": "Amos",
    "spanish_name": "Amós",
    "section": "neviim",
    "total_chapters": 10,
    "total_verses": 166
  },
  "chapters": [
    {
      "chapter": 1,
      "verses": [
        {
          "verse": 1,
          "tth": "Palabras de Amós...",
          "footnotes": [
            {
              "marker": "¹",
              "number": "1",
              "word": "palabra",
              "explanation": "..."
            }
          ],
          "hebrew_terms": []
        }
      ]
    }
  ]
}
```

**Benefits of tth format:**

- 67% smaller file sizes
- Single file per book (38 total) vs multiple chapter files
- Hierarchical structure for better organization
- Faster loading with improved caching efficiency

## Deployment

The backend is designed for JSON-first deployment with private TS2009 content stored in Supabase Storage.

### TS2009 Private Content

TS2009 English translations are licensed/private and not committed to GitHub. They are stored in a private Supabase Storage bucket and synced to the runtime data directory in a background task after API startup.

- Storage bucket: `ts2009`
- Sync script: `scripts/sync_ts2009.py`
- Requires: `DAVAR_SUPABASE_URL` and `DAVAR_SUPABASE_SERVICE_KEY`
- Optional toggle: `DAVAR_TS2009_SYNC_ON_STARTUP` (default `true`)

### Render Deployment

1. Create a Render web service from this GitHub repository.
2. Set build command: (none, or pip install if needed)
3. Set start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Configure environment variables from `.env.example`.
5. Set Render branch to `main`.

Notes:
- The API starts first and TS2009 files sync in the background, reducing cold-start blocking.
- If TS2009 is not ready yet, English translation fields may be temporarily unavailable for the first requests.
- To force a manual full sync, run: `python scripts/sync_ts2009.py`.

Troubleshooting:
- If startup logs show proxy/network errors (for example `ProxyError: 502 Bad Gateway`), set `DAVAR_TS2009_SYNC_ON_STARTUP=false` and run manual sync when network access is available.
- Ensure `DAVAR_SUPABASE_URL` points to your Supabase project URL; the backend normalizes URL formatting for storage client compatibility.
- In proxy-restricted environments, verify `HTTPS_PROXY`/`HTTP_PROXY` and `NO_PROXY` values.

### Branch Strategy

- `main`: development and production branch.

Release flow:

1. Merge feature branches into `main`.
2. After approvals/checks, merge into `main`.
3. Render auto-deploy runs from `main`.

### Environment Variables

See `.env.example` for required variables. For production, use separate Supabase project and keys.
