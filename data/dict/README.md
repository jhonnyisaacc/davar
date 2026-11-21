# Hebrew Scripture Data Repository

This directory contains all processed Hebrew Scripture data for the Davar study app. It implements a consolidated architecture with optimized JSON files for maximum performance and minimal storage requirements.

## 📁 Directory Structure

```
data/dict/
├── README.md                    # This documentation
├── HYBRID_SYSTEM_EXPLANATION.md # Technical system explanation
├── README_VERSES.md            # Legacy verse documentation
│
├── lexicon/                     # 🧠 LEXICON DATA - Consolidated word definitions
│   ├── roots.json              # All primitive roots (3,131 entries)
│   ├── words.json              # All derived words (6,312 entries)
│   └── testing/                # Development samples (1% of data)
│       ├── words/              # Test derived words
│       └── roots/              # Test primitive roots
│
├── books/                       # 📖 BOOK DATA - Consolidated verse files
│   ├── genesis.json            # Complete Genesis book
│   ├── exodus.json            # Complete Exodus book
│   ├── leviticus.json          # Complete Leviticus book
│   └── ...                     # All 33 Tanakh books (18,406 verses total)
│
└── raw/                        # 📚 RAW SOURCE DATA - Read-only
    ├── morphus/                # BDB morphological analysis (39 XML files)
    │   ├── Gen.xml            # Genesis morphology
    │   ├── Exod.xml           # Exodus morphology
    │   └── ...
    ├── bdb_full.json           # Complete BDB dictionary
    ├── bdb_dict_en.json        # BDB English definitions
    ├── BrownDriverBriggs.xml   # Original BDB XML source
    ├── HebrewStrong.xml        # Strong's Hebrew dictionary
    ├── strongs_hebrew_dict_en.json # Strong's English definitions
    └── strong_refs.json        # Strong's reference mapping
```

## 🎯 System Architecture

### Consolidated Design Philosophy

**Challenge**: Managing thousands of individual files creates filesystem overhead and complicates data management.

**Solution**: Consolidated architecture:
1. **📚 Lexicon Layer** (`lexicon/`) - All word definitions in optimized JSON files
2. **📖 Book Layer** (`books/`) - Complete books with all verses in single files

### Key Benefits
- 🚀 **Performance**: Reduced I/O operations and filesystem overhead
- 💾 **Efficiency**: Consolidated JSON reduces storage overhead
- 🔧 **Maintainability**: Simplified file management and version control
- 🔄 **Flexibility**: Easy to load complete books or search entire lexicons
- 📱 **Scalability**: Optimal for mobile app with reduced file count (35 vs 27,849 files)

## 📚 Data Sources

### Primary Data Sources

| Source | Description | Location | Status |
|--------|-------------|----------|---------|
| **ISR Scriptures** | Hebrew Tanakh text | `../oe/` | ✅ Processed |
| **Open Scriptures MorphHB** | Morphological analysis (39 books) | `raw/morphus/` | ✅ Integrated |
| **Brown-Driver-Briggs** | Comprehensive Hebrew lexicon | `raw/BrownDriverBriggs.xml` | ✅ Processed |
| **Strong's Dictionary** | Standard Hebrew word numbering | `raw/HebrewStrong.xml` | ✅ Referenced |

### Supporting Sources

| Source | Description | Purpose |
|--------|-------------|---------|
| **TTH Translation** | Spanish translation | Multi-language support |
| **TS2009 Translation** | Hebrew transliteration | Book name standardization |
| **Custom Dictionary** | Curated 72-word definitions | Enhanced definitions |

### Data Processing Pipeline

```
📥 Raw Sources ──→ 🔄 Processing Scripts ──→ 📤 Processed Data
├── ISR text         ├── build_lexicon.py      ├── lexicon/words+roots/
├── BDB XML          ├── build_verses.py       └── verses/*/
├── Morphus XML      └── qa.py validation
└── Strong's refs
```

### Processing Workflow

```
🎯 INPUT SOURCES                    🔄 PROCESSING SCRIPTS                📤 OUTPUT DATA
├── ISR Hebrew Text (oe/)         ├── scripts/dict/build_lexicon.py    ├── lexicon/roots.json
├── BDB XML (raw/)                ├── scripts/dict/build_verses.py     ├── lexicon/words.json
├── Morphological Data (morphus/) ├── scripts/dict/temp/optimize_json.py ├── books/*.json
├── Strong's References (raw/)    └── scripts/dict/qa.py              └── validation & QA
└── Custom Definitions (tth/)

📊 RESULT: 9,443 lexicon entries + 33 book files (18,406 verses)
```

## 🚀 Processing Scripts

**📍 Location**: All processing scripts are located in `scripts/dict/`

### 1. Verse Builder (`scripts/dict/build_verses.py`)

**Purpose**: Generates lightweight verse JSON files for all Hebrew Scripture books.

```bash
# Process ALL books (complete Tanakh)
python scripts/dict/build_verses.py

# Process specific book
python scripts/dict/build_verses.py --book genesis

# Process specific chapter
python scripts/dict/build_verses.py --book exodus --chapter 1

# Verbose output
python scripts/dict/build_verses.py --verbose
```

**Core Features:**
- 📖 Processes all 39 Tanakh books automatically
- 🔍 Integrates BDB morphological analysis from `raw/morphus/`
- 🔢 Extracts and validates Strong's numbers
- 🎯 Validates senses against lexicon definitions
- 💾 Outputs optimized JSON format (~31,000 files)

### 2. Lexicon Builder (`scripts/dict/build_lexicon.py`)

**Purpose**: Builds complete Hebrew lexicon with definitions, senses, and references.

```bash
# Build ALL lexicon entries (production)
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json

# Update existing entries
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json --update

# Testing mode (1% sample)
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json --testing
```

A BDB `<def>` that breaks off on a word such as "be" or "of" takes the next
`<def>` or inline `<w>` that completes it, so "be" or "act as adversary"
becomes "be or act as adversary". The gloss also continues after a comma when
"be" is followed by a gloss of more than one word ("be", "become weak"), after
", or" and ", and", and after the abbreviated divine name י׳, which it writes
as YHWH ("May YHWH give joy!"). `python -m scripts.dict.bdb_truncated_glosses
--write` completes the glosses that the committed lexicon stored cut off,
without rebuilding any other field. It drops a cut-off gloss that an entry
holds but whose BDB entry does not have it. It takes the Spanish of each
completed gloss from `lexicon/bdb_completed_glosses_es.json`, and gives that
Spanish to every BDB record whose English is in the file. `--check` fails
while a truncated gloss or a different Spanish remains.

`python -m scripts.dict.reader_gloss <strong>...` prints the first English and
Spanish gloss that the reader shows for an entry.

### 3. Quality Assurance (`scripts/dict/qa.py`)

**Purpose**: Validates lexicon data quality, structure, and integrity.

```bash
# Full validation
python scripts/dict/qa.py

# Quick validation
python scripts/dict/qa.py --quick
```

**Validation Checks:**
- 📁 File structure and naming conventions
- 🔗 Cross-references between words and roots
- 📊 Strong's coverage completeness
- 📖 Occurrence validation and accuracy
- 🎯 Sense hierarchy validation
- 🎭 Definition completeness checking

# Quick validation
python3 lexicon/qa.py --quick
```

## 📄 Data Formats

### Consolidated Book Format

```json
{
  "1": {
    "1": {
      "reference": "genesis.1.1",
      "book_id": "genesis",
      "chapter": 1,
      "verse": 1,
      "hebrew_text": "בְּ רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַ שָּׁמַ֖יִם וְ אֵ֥ת הָ אָֽרֶץ",
      "words": [
        {
          "position": 1,
          "hebrew": "בְּרֵאשִׁ֖ית",
          "strong_number": "H7225",
          "sense": "1"
        }
      ]
    },
    "2": { /* verse 1.2 */ },
    "3": { /* verse 1.3 */ }
  },
  "2": { /* chapter 2 */ },
  "50": { /* chapter 50 */ }
}
```

### Consolidated Lexicon Format

**roots.json structure:**
```json
{
  "H1": {
    "strong_number": "H1",
    "lemma": "אָב",
    "normalized": "אב",
    "pronunciation": "awb",
    "definitions": [/* ... */],
    "sources": {"bdb": true},
    "is_root": true
  },
  "H2": { /* next root */ },
  "H7999": { /* שלם root */ }
}
```

**words.json structure:**
```json
{
  "H7965": {
    "strong_number": "H7965",
    "lemma": "שָׁלוֹם",
    "normalized": "שלום",
    "pronunciation": "shaw-lome'",
    "definitions": [/* ... */],
    "sources": {"bdb": true, "strong": true},
    "root_ref": "H7999",
    "is_root": false
  },
  "H7966": { /* next word */ }
}
```

## 🔄 Data Generation Workflow

### Initial Setup

1. **Verify raw data sources** are in `raw/` directory
2. **Ensure Hebrew text** is available in `../oe/` directory
3. **Check lexicon dependencies** in `lexicon/` directory

### Generate Books

```bash
# Generate all consolidated books
python scripts/dict/build_verses.py

# Verify output in books/ directory
ls books/ | wc -l  # Should show 33
```

### Generate Lexicon (if needed)

```bash
# Build complete lexicon (production)
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json

# Validate quality
python scripts/dict/qa.py
```

## 📊 Statistics

| Component | Count | Notes |
|-----------|-------|-------|
| **Books** | 33 | Complete Tanakh books |
| **Verses** | 18,406 | All Tanakh verses consolidated |
| **Root Entries** | 3,131 | Primitive Hebrew roots |
| **Word Entries** | 6,312 | Derived Hebrew words |
| **Lexicon Total** | 9,443 | Complete Hebrew lexicon |
| **Storage Saved** | ~40% | Minified JSON vs individual files |
| **File Reduction** | 27,814 | From 27,849 to 35 files |

## ⚠️ Important Notes

### Licensing Restrictions
- **ISR Text**: Attribution required, one verse per screen
- **TTH Translation**: Permission from Natanael Doldan requires manual processing
- **Raw Data**: Never modify files in `raw/` directory

### File Organization
- **`raw/`**: Source data - read-only, never modify
- **`lexicon/`**: Processed definitions - generated from raw data
- **`verses/`**: Lightweight references - generated from oe/ + morphus/

### Dependencies
- Python 3.8+
- XML parsing libraries (built-in)
- JSON processing (built-in)
- Path manipulation (pathlib)

## 🔧 Troubleshooting

### Common Issues

**"Morphus directory not found"**
- Ensure `raw/morphus/` contains XML files
- Check file permissions

**"Book not found in mapping"**
- Verify book name spelling
- Check available books in `BookMapper.BOOK_MAPPING`

**"Lexicon validation failed"**
- Run `python scripts/dict/qa.py` for detailed diagnostics
- Check `lexicon/testing/` for sample data

### Data Validation

```bash
# Quick validation
python scripts/dict/qa.py --quick

# Full validation
python scripts/dict/qa.py

# Test verse generation
python scripts/dict/build_verses.py --book genesis --chapter 1 --verbose
```

## 📝 Development Guidelines

### Data Management
- **🔒 Raw sources** (`raw/`) - Never modify, read-only reference data
- **📤 Generated data** (`verses/`, `lexicon/words+roots/`) - Can be committed to version control
- **🧪 Testing data** (`lexicon/testing/`) - Development only, exclude from commits
- **🔧 Scripts** (`scripts/dict/`) - Processing tools and utilities

### Production Workflow
```bash
# 1. Build consolidated lexicon
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json

# 2. Generate consolidated books
python scripts/dict/build_verses.py

# 3. Optimize JSON files (optional, for production)
python scripts/dict/temp/optimize_json.py --minify

# 4. Quality assurance
python scripts/dict/qa.py
```

### Development Workflow
```bash
# Test with small sample
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json --testing

# Validate and iterate
python scripts/dict/qa.py --quick
```

---

*Last updated: December 29, 2025 - Consolidated Architecture*

*Hebrew Scripture Data Repository - Core data for the Davar study app. Balancing technical excellence with spiritual sensitivity for deep engagement with sacred texts.*
