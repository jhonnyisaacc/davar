# Davar Static Data Architecture - Data Access Guide

## 🚀 Architecture Overview

**Status:** Backend eliminated. Public data is served as static JSON from Cloudflare Pages. TS2009 licensed content is served through a private Cloudflare R2 bucket behind a Pages Function on the same origin.

### Data Sources

1. **Public Data (Static JSON):** Served from `https://davar.bible/data/`
   - OE (Masoretic/Tanaj)
   - Delitzsch (Besorah)
   - DSS variants
   - Dictionary, prefixes, transliterations
   - TTH (Spanish), BES (Spanish fallback)

2. **TS2009 (Licensed):** Served from private Cloudflare R2 via `/api/ts2009/*`
  - Not included in public `dist/data`
  - Accessed through a same-origin Pages Function

### Web App Access
- Uses `web/src/app/services/staticData.ts` for cached static file fetches
- Uses `web/functions/api/ts2009/[[path]].ts` as the protected TS2009 endpoint

### Mobile App Access
- Downloads public bundles from static URLs during offline sync
- Loads online TS2009 book files through the same R2-backed `/api/ts2009/*` endpoint as web
- Stores downloaded offline data in the local SQLite database

## 📊 Data Endpoints

### Static Data URLs
```
https://davar.bible/data/
├── metadata.json                    # Books list, chapter/verse counts
├── oe/{book}/{chapter}.json         # Hebrew verses (per chapter)
├── besorah/{book}/{chapter}.json    # Delitzsch verses (per chapter)
├── tth/{book}.json                  # TTH Spanish (per book)
├── bes/{book}.json                  # BES Spanish fallback (per book)
├── dss/{book}.json                  # DSS variants (per book)
├── dict/
│   ├── words.json                   # Full dictionary
│   ├── roots.json                   # Root definitions
│   └── custom_definitions.json      # Custom definitions
├── prefixes.json                    # All prefixes (4KB)
├── translit/{book}.json             # Transliterations (per book)
└── bundles/
    ├── versions.json                # Bundle version tracking
    ├── tanaj.json                   # OE split index (book list + checksums)
    ├── tanaj/{book}.json            # OE/Masoretic per-book bundles
    ├── besorah.json                 # Delitzsch bundle
    ├── tth.json                     # TTH Spanish bundle
    ├── dictionary.json              # Dictionary bundle
    └── dss.json                     # DSS bundle
```

### Private TS2009 API Access
- Bucket: `ts2009`
- Objects: `{book}.json` at bucket root, for example `bereshit.json`
- Web access path: `/api/ts2009/{book}.json`
- Access: same-origin Pages Function with private R2 binding

## 🧪 Testing Data Access

### 1. Test Static Data

```bash
# Test metadata
curl https://davar.bible/data/metadata.json

# Test a Hebrew chapter (Genesis 1)
curl https://davar.bible/data/oe/genesis/1.json

# Test Spanish translation (Genesis)
curl https://davar.bible/data/tth/genesis.json

# Test dictionary
curl https://davar.bible/data/dict/words.json
```

### 2. Test Bundle Downloads

```bash
# Test bundle versions
curl https://davar.bible/data/bundles/versions.json

# Test Tanaj split index
curl https://davar.bible/data/bundles/tanaj.json

# Test a Tanaj per-book bundle
curl https://davar.bible/data/bundles/tanaj/genesis.json
```

### 2.1 Diagnose HTML Instead of JSON

If any `/data/...json` endpoint returns HTML (`<!doctype html>`) with status `200`, the site is serving SPA fallback instead of static data files.

Quick check:

```bash
curl -i https://davar.bible/data/metadata.json | head -n 20
```

Expected:
- `Content-Type: application/json` (or similar JSON type)
- Body starts with `{` or `[`.

Failure signature:
- `Content-Type: text/html`
- Body starts with `<!doctype html>`.

When this happens, verify Cloudflare Pages project settings:
- Root directory is `web`
- Build command is `bun run build:cf` (or the expanded `bun install --frozen-lockfile && bun run build:prod`)
- Build output directory is `dist`
- The latest deployment includes `dist/data/metadata.json`
- Custom domain `davar.bible` points to that same Pages project/deployment

### 3. Test Web TS2009 API

```bash
# Test the private same-origin API on production
curl https://davar.bible/api/ts2009/bereshit.json
```

Expected:
- `Content-Type: application/json`
- Book JSON payload returned from the private R2 bucket

Also verify the old public path is gone:

```bash
curl -i https://davar.bible/data/ts2009/bereshit.json
```

Expected:
- `404` or missing file response

### 4. Test Mobile TS2009

Mobile requests the same Cloudflare endpoint and does not require a Supabase
client key:

```bash
curl https://davar.bible/api/ts2009/bereshit.json
```

## 🔧 Development

### Generating Static Data
```bash
# From project root
bun run generate-data
```

This generates all static JSON files to `web/public/data/`.

### Web App Development
```bash
cd web
bun run dev
```

### Mobile App Development
```bash
cd mobile
bun run start
```

## 📝 Migration Notes

- **Backend Archived:** Original FastAPI backend moved to `archive/backend/`
- **No Client API Keys:** Public data and the R2-backed TS2009 proxy require no client-side credentials
- **TS2009 Only:** Stored privately in R2 and exposed through the Pages Function
- **Caching:** Web app caches static data in memory for performance
- **Offline First:** Mobile app downloads bundles for offline use

---

*This guide replaces the previous FastAPI backend testing guide.*

#### 🔐 Generating Secure API Keys

**For Development:**
```bash
# Create or update .env file in backend directory
cd backend
echo "DAVAR_API_KEY=your-dev-key" > .env  # Creates new file (overwrites if exists)
# OR append if file already exists:
# echo "DAVAR_API_KEY=your-dev-key" >> .env

# Then export it for immediate use
export API_KEY="your-dev-key"
```

**For Production (secure method):**
```bash
# Generate a cryptographically secure random key
python -c "import secrets; print('DAVAR_API_KEY=' + secrets.token_urlsafe(32))"
# Output: DAVAR_API_KEY=lhg-nRFu6G9tBnXJM3Sxi-1ASkcZ1hPUaTYHCQ8YaO4

# Or using openssl
openssl rand -hex 32
```

**Security Best Practices:**
- Use `secrets.token_urlsafe()` or `secrets.token_hex()` for cryptographically secure keys
- Never use predictable or hardcoded keys in production
- Store keys in environment variables (`.env` files) - never commit them to version control
- Use different keys for development, staging, and production
- Rotate keys regularly (every 90 days)
- Never commit real API keys to version control
- Use HTTPS in production to encrypt API key transmission
- Always use environment variables (`$API_KEY`) instead of hardcoding keys in scripts or documentation

---

## 🧪 Manual Testing Commands

### 1. Health Check

Test that the server is running:
    
```bash
curl -X GET "http://localhost:2220/health"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

### 2. Root Endpoint

```bash
curl -X GET "http://localhost:2220/"
```

**Expected Response:**
```json
{
  "message": "Davar API - Hebrew Scripture Study",
  "docs": "/docs",
  "health": "/health"
}
```

### 3. API Documentation

Visit in browser: `http://localhost:2220/docs`

---

## 📚 Books Endpoints

### 3.1 List All Books

```bash
curl -X GET "http://localhost:2220/api/v1/books" \
  -H "X-API-Key: $API_KEY"
```

**Expected Response:** Array of books with id, name, section, chapters

### 3.2 List Books by Section

```bash
# Torah books only
curl -X GET "http://localhost:2220/api/v1/books?section=torah" \
  -H "X-API-Key: $API_KEY"

# Neviim books only
curl -X GET "http://localhost:2220/api/v1/books?section=neviim" \
  -H "X-API-Key: $API_KEY"

# Ketuvim books only
curl -X GET "http://localhost:2220/api/v1/books?section=ketuvim" \
  -H "X-API-Key: $API_KEY"

# Besorah books only
curl -X GET "http://localhost:2220/api/v1/books?section=besorah" \
  -H "X-API-Key: $API_KEY"
```

### 3.3 Get Chapters for a Book

```bash
curl -X GET "http://localhost:2220/api/v1/books/Genesis/chapters" \
  -H "X-API-Key: $API_KEY"
```

**Expected Response:**
```json
{
  "book": "Genesis",
  "chapters": [1, 2, 3, ..., 50]
}
```

### 3.4 Get Verse Count for a Chapter

```bash
curl -X GET "http://localhost:2220/api/v1/books/Genesis/chapters/1/verses" \
  -H "X-API-Key: $API_KEY"
```

**Expected Response:**
```json
{
  "book": "Genesis",
  "chapter": 1,
  "verse_count": 31
}
```

---

## 📖 Verses Endpoints

### 4.1 Get Verses (Hebrew Only)

```bash
curl -X GET "http://localhost:2220/api/v1/verses/Genesis/1" \
  -H "X-API-Key: $API_KEY"
```

### 4.2 Get Verses with Spanish Translation

```bash
curl -X GET "http://localhost:2220/api/v1/verses/Genesis/1?language=es" \
  -H "X-API-Key: $API_KEY"
```

### 4.3 Get Verses with English Translation

```bash
curl -X GET "http://localhost:2220/api/v1/verses/Genesis/1?language=en" \
  -H "X-API-Key: $API_KEY"
```

### 4.4 Get Verses with DSS Variants

```bash
curl -X GET "http://localhost:2220/api/v1/verses/Genesis/1?show_dss=true" \
  -H "X-API-Key: $API_KEY"
```

### 4.5 Get Verses with All Options

```bash
curl -X GET "http://localhost:2220/api/v1/verses/Genesis/1?language=en&show_dss=true" \
  -H "X-API-Key: $API_KEY"
```

### 4.6 Test Different Books

```bash
# Tanaj (Hebrew Bible)
curl -X GET "http://localhost:2220/api/v1/verses/Psalms/1" \
  -H "X-API-Key: $API_KEY"

# Besorah (New Testament)
curl -X GET "http://localhost:2220/api/v1/verses/Matthew/1" \
  -H "X-API-Key: $API_KEY"
```

---

## 🔍 Lexicon Endpoints

### 5.1 Get Word Definition (Hebrew)

```bash
curl -X GET "http://localhost:2220/api/v1/lexicon/H430" \
  -H "X-API-Key: $API_KEY"
```

### 5.2 Get Word Definition (Greek)

```bash
curl -X GET "http://localhost:2220/api/v1/lexicon/G3056" \
  -H "X-API-Key: $API_KEY"
```

---

## 🔤 Prefixes Endpoints

### 6.1 Get Prefix Definition

```bash
curl -X GET "http://localhost:2220/api/v1/prefixes/Hb" \
  -H "X-API-Key: $API_KEY"
```

---

## ❌ Error Testing

### 7.1 Missing API Key

```bash
curl -X GET "http://localhost:2220/api/v1/books"
```

**Expected:** 401 Unauthorized

### 7.2 Invalid API Key

```bash
curl -X GET "http://localhost:2220/api/v1/books" \
  -H "X-API-Key: wrong-key"
```

**Expected:** 401 Unauthorized

### 7.3 Invalid Book Name

```bash
curl -X GET "http://localhost:2220/api/v1/verses/InvalidBook/1" \
  -H "X-API-Key: $API_KEY"
```

**Expected:** 404 Not Found

### 7.4 Invalid Chapter Number

```bash
curl -X GET "http://localhost:2220/api/v1/verses/Genesis/999" \
  -H "X-API-Key: $API_KEY"
```

**Expected:** 404 Not Found

### 7.5 Invalid Language

```bash
curl -X GET "http://localhost:2220/api/v1/verses/Genesis/1?language=fr" \
  -H "X-API-Key: $API_KEY"
```

**Expected:** 400 Bad Request

### 7.6 Invalid Section

```bash
curl -X GET "http://localhost:2220/api/v1/books?section=invalid" \
  -H "X-API-Key: $API_KEY"
```

**Expected:** Empty array or filtered results

---

## 📊 Expected Response Formats

### Books Response
```json
[
  {
    "id": "Genesis",
    "name": "Genesis",
    "section": "torah",
    "chapters": 50,
    "testament": "tanaj"
  }
]
```

### Verses Response
```json
[
  {
    "chapter": 1,
    "verse": 1,
    "hebrew": "בְּ/רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַ/שָּׁמַ֖יִם וְ/אֵ֥ת הָ/אָֽרֶץ׃",
    "hebrew_no_nikud": "ב/ראשית ברא אלהים את ה/שמים ו/את ה/ארץ",
    "words": [
      {
        "position": 1,
        "text": "בְּ/רֵאשִׁ֖ית",
        "text_no_nikud": "ב/ראשית",
        "strong": "Hb/H7225",
        "morph": "HR/Ncfsa",
        "prefixes": ["Hb"],
        "has_dss_variant": false
      }
    ],
    "translation": "En el principio creó Dios los cielos y la tierra.",
    "translation_language": "es",
    "translation_footnotes": [
      {
        "marker": "¹",
        "number": "1",
        "word": "Con",
        "explanation": "O, Por medio de."
      }
    ],
    "dss": null
  }
]
```

### Lexicon Response
```json
{
  "strong_number": "H430",
  "hebrew": "אֱלֹהִים",
  "transliteration": "ʼĕlōhîm",
  "definitions": [
    {
      "text": "gods, God",
      "source": "custom",
      "language": "en"
    }
  ],
  "root": "אלה",
  "root_strong": "H433",
  "occurrences_count": 2601
}
```

### Prefix Response
```json
{
  "id": "Hb",
  "hebrew": "בְּ",
  "meanings_en": ["in", "with", "by"],
  "meanings_es": ["en", "con", "por"],
  "examples": ["בְּ/רֵאשִׁ֖ית (in the beginning)"]
}
```

---

## 🐛 Debugging Tips

### 1. Check Server Logs
The server logs will show request IDs and any errors:

```
INFO: Request 12345678-1234-1234-1234-123456789abc: GET /api/v1/books
```

### 2. Request ID in Response Headers
Every API response includes an `X-Request-ID` header for tracing.

### 3. Common Issues

- **401 Unauthorized**: Check your API key header
- **404 Not Found**: Verify book names and chapter numbers exist
- **500 Internal Server Error**: Check server logs for details
- **Empty responses**: Data files might not be loading correctly

### 4. Test Data Availability

Check if data files exist:
```bash
ls -la data/oe/genesis/
ls -la data/delitzsch/parsed/matthew/
ls -la data/tth/json/
ls -la data/ts2009/
```

---

## ✅ Success Checklist

After testing, verify these work:

- [ ] `/health` returns healthy status
- [ ] `/api/v1/books` returns book list with authentication
- [ ] `/api/v1/books?section=torah` filters correctly
- [ ] `/api/v1/books/Genesis/chapters` returns chapter list
- [ ] `/api/v1/verses/Genesis/1` returns Hebrew text
- [ ] `/api/v1/verses/Genesis/1?language=es` includes Spanish translation
- [ ] `/api/v1/verses/Matthew/1` works for New Testament
- [ ] `/api/v1/lexicon/H430` returns word definition
- [ ] `/api/v1/prefixes/Hb` returns prefix info
- [ ] All endpoints properly reject invalid API keys
- [ ] Error responses have consistent format

---

## 🔄 Quick Test Script

Run this to test all endpoints quickly:

```bash
#!/bin/bash
# Make sure API_KEY is set before running
if [ -z "$API_KEY" ]; then
  echo "Error: API_KEY environment variable is not set"
  echo "Set it with: export API_KEY='your-api-key'"
  exit 1
fi

BASE_URL="http://localhost:2220"

echo "Testing Davar API..."

# Health check
curl -s "$BASE_URL/health" | jq '.status'

# Books
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/v1/books" | jq 'length'

# Verses
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/v1/verses/Genesis/1" | jq 'length'

# Lexicon
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/v1/lexicon/H430" | jq '.strong_number'

echo "Tests complete!"
```
