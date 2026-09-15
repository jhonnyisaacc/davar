# Hebrew Scripture Processing Toolkit

This directory contains a unified command-line interface for processing Hebrew Scripture data, including lexicon building, verse generation, validation, and translation. The toolkit provides a complete pipeline for transforming raw Hebrew text data into structured JSON files.

## 🚀 Unified CLI

All operations are now available through a single professional CLI:

```bash
# Get help
python cli.py --help

# Build lexicon
python cli.py lexicon build lexicon_100_percent_list.json
python cli.py lexicon build H7965 --update

# Build verses
python cli.py verses build --book genesis

# Validate data
python cli.py validate --quick

# Translate definitions
python cli.py translate run --language es --batch-size 500

# Consolidate lexicon files
python cli.py lexicon consolidate --preserve-translations

# Export translation backup
python cli.py sync export-translations
```

## 📁 Directory Structure

```
scripts/dict/
├── README.md                        # This documentation
├── __init__.py                      # Package marker
├── __main__.py                      # CLI entry point
├── cli.py                           # Unified command-line interface
├── utils.py                         # ⭐ Shared utilities (JSON I/O, validation, etc.)
├── lexicon_100_percent_list.json    # Complete Strong's numbers list
├── config.py                        # Configuration and paths
├── book_mappings.py                 # Book name mappings
│
├── build_lexicon.py                 # 🏗️ Main lexicon builder
├── build_verses.py                  # 🏗️ Main verse builder
├── validator.py                     # ✅ Quality assurance (formerly qa.py)
├── integrate_custom_dict.py         # 📖 Custom dictionary integration
│
├── strong_processor.py              # Strong's number processing
├── morphhb.py                       # Morphological data loader (formerly morphus_loader.py)
├── verse_processor.py               # Verse processing logic
│
├── lexicon/                         # Lexicon operations package
│   ├── __init__.py
│   └── consolidate.py               # Consolidate individual files
│
├── verses/                          # Verse operations package
│   └── __init__.py
│
├── translation/                     # 🌍 Translation package
│   ├── README.md                    # Translation documentation
│   ├── config.py                    # Translation configuration
│   ├── translator.py                # Grok API client
│   ├── processor.py                 # Translation processor
│   ├── main.py                      # CLI entry point
│   └── fix_mismatches.py            # Fix missing translations
│
└── sync_translations_to_individual.py  # Sync translations
```

### 6. TCY Site Dictionary Import

`import_tcysite.py` imports the permitted Torah con Yehoshua' dictionary JSON
assets without scraping rendered pages. It preserves each Eric source row,
resolves exact Greek/Hebrew matches to canonical Strong IDs, and assigns
unmatched rows stable `D1000000+` fallback IDs.

```bash
python scripts/dict/import_tcysite.py --fetch
python scripts/dict/test_import_tcysite.py
```

Source snapshots, checksums, attribution, and permission notes are stored in
`data/dict/raw/tcysite/`. Imported definitions are Spanish-only until their
English and Hebrew translations receive a separate human review. Each manifest
file entry includes its SHA-256 checksum, byte size, and record count. Running
`--fetch` preserves the prior retrieval timestamp when all source content and
manifest metadata are unchanged, so repeated fetches remain deterministic.

#### Attribution for imported custom definitions

The newly imported custom dictionary definitions are attributed to the [Torah
con Yehoshua' Hamashiaj site](https://www.torah-con-yehoshua-hamashiaj.com/),
including its Greek and Hebrew dictionary content. The site describes the
Eric de Jesús Rodríguez Mendoza notes used in this import as follows:

> Diccionario lingüístico y comentarios anexados elaborados con base en
> estudios y líneas académicas del profesor y especialista en estudios bíblicos
> Eric de Jesús Rodríguez Mendoza. Su mención no implica afiliación oficial,
> patrocinio ni cesión de derechos.

This attribution travels with the imported data and does not imply official
affiliation, sponsorship, or transfer of rights. See the committed source
manifest for the source URLs, permission note, checksums, and retrieval
metadata.

## 🏗️ Core Operations

### 1. Lexicon Building

Build complete Hebrew lexicon entries with definitions, senses, and references.

```bash
# Build complete lexicon (production)
python cli.py lexicon build lexicon_100_percent_list.json

# Build complete lexicon (update existing)
python cli.py lexicon build lexicon_100_percent_list.json --update

# Testing mode (1% sample for development)
python cli.py lexicon build lexicon_100_percent_list.json --testing

# Single entry
python cli.py lexicon build H7965

# Fill missing definitions
python cli.py lexicon build --fill-missing
```

**Features:**
- ✅ BDB (Brown-Driver-Briggs) definitions with sense assignment
- ✅ Strong's concordance references
- ✅ Automatic root identification and linking
- ✅ Morphological analysis integration
- ✅ Quality validation and cross-referencing

### 2. Verse Building

Generate lightweight verse JSON files for all Hebrew Scripture books.

```bash
# Build all books
python cli.py verses build

# Build specific book
python cli.py verses build --book genesis

# Build specific chapter
python cli.py verses build --book exodus --chapter 1
```

**Features:**
- ✅ ISR Hebrew text processing
- ✅ Morphological analysis integration (BDB senses)
- ✅ Strong's number extraction and validation
- ✅ Multi-book support (Genesis through Malachi)
- ✅ Lightweight JSON format for optimal performance

### 3. Data Validation

Validate lexicon data quality and structure.

```bash
# Full validation
python cli.py validate

# Quick validation
python cli.py validate --quick
```

**Validates:**
- File structure and naming conventions
- JSON validity and required fields
- Cross-references between words and roots
- Strong's coverage and occurrences
- Sense hierarchy completeness
- Definition completeness

### 4. Translation

Translate English definitions to multiple languages using xAI's Grok API.

```bash
# Translate to Spanish (recommended batch size)
python cli.py translate run --language es --batch-size 500

# Translate specific file
python cli.py translate run --file roots --language es --batch-size 500

# Translate single entry
python cli.py translate run --strong-number H1 --language es

# Fix missing translations
python cli.py translate fix --language es --batch-size 500
```

**Features:**
- ✅ Batch translation (1-1000 definitions per call)
- ✅ Cross-entry batching for efficiency
- ✅ Robust JSON extraction (4-strategy approach)
- ✅ Automatic mismatch handling
- ✅ Progress tracking with ETA

### 5. Consolidation & Sync

Manage consolidated lexicon files and translations.

```bash
# Consolidate individual files into roots.json/words.json
python cli.py lexicon consolidate --preserve-translations

# Sync translations from consolidated to individual files
python cli.py sync to-individual --file both

# Export translations to backup file
python cli.py sync export-translations
```

## 📊 Data Flow

```
Raw Data (data/dict/raw/)
    ├── ISR Hebrew text (oe/)
    ├── BDB XML (BrownDriverBriggs.xml)
    ├── Strong's dictionaries
    └── Morphological analysis (morphus/)

           ↓ lexicon build

Individual Files (data/dict/lexicon/)
    ├── words/ - Derived words with definitions
    └── roots/ - Primitive roots

           ↓ lexicon consolidate

Consolidated Files (data/dict/lexicon/)
    ├── roots.json - All root entries
    └── words.json - All word entries

           ↓ verses build

Verse Data (data/dict/verses/)
    ├── genesis/ - Lightweight verse files
    ├── exodus/ - ...
    └── ... (all books)
```

## ⚙️ Configuration

### `config.py`

Central configuration file containing:
- Project paths and directories
- File locations for raw data
- Output directory settings
- Lexicon processing parameters

### `utils.py` - Shared Utilities

Central utilities module providing common functionality:

**JSON Operations:**
- `load_json()` - Load JSON with proper error handling
- `save_json()` - Save pretty-printed JSON
- `save_json_minified()` - Save minified JSON for production
- `extract_json_array_robust()` - Extract JSON from LLM responses

**Data Loaders:**
- `load_strongs_data()` - Load Strong's dictionary
- `load_strong_refs()` - Load Strong's references
- `load_bdb_xml()` - Load BDB XML data

**Validation:**
- `validate_lexicon_entry()` - Complete entry validation
- `StatisticsCollector` - Collect and report statistics

## 🔧 Development Guidelines

### Adding New Features

1. **Modular Design**: Keep functionality in separate modules
2. **Configuration**: Use `config.py` for paths and settings
3. **Testing**: Use `--testing` mode for development
4. **Validation**: Run validation after changes

### Code Organization

- **`cli.py`**: Unified command-line interface
- **`config.py`**: All paths and configuration
- **`utils.py`**: Shared utilities and data loaders
- **`build_*.py`**: Main processing scripts
- **`lexicon/`**: Lexicon-specific operations
- **`verses/`**: Verse-specific operations
- **`translation/`**: Translation operations

## 🌍 Translation Details

**Batch Size Recommendations:**
- **Small batches (50-100)**: More granular progress, better for testing
- **Large batches (500)**: ⭐ **Recommended for production** - fastest processing

**Supported Languages:** es, pt, fr, de, it, etc.

**See [`translation/README.md`](translation/README.md) for detailed documentation.**

## 📈 Production Usage

### Complete Pipeline

```bash
# 1. Build complete lexicon
python cli.py lexicon build lexicon_100_percent_list.json

# 2. Consolidate into JSON files
python cli.py lexicon consolidate

# 3. Build all verse files
python cli.py verses build

# 4. Validate results
python cli.py validate
```

### Development Workflow

```bash
# 1. Test with small sample
python cli.py lexicon build lexicon_100_percent_list.json --testing

# 2. Validate testing data
python cli.py validate

# 3. Run on full dataset when ready
python cli.py lexicon build lexicon_100_percent_list.json
```

## 🛠️ Troubleshooting

### Common Issues

**CLI Not Found**
- Run from `scripts/dict/` directory
- Use `python cli.py` instead of `python -m scripts.dict`

**Missing Dependencies**
- Ensure all required data files exist in `data/dict/raw/`
- Check that `data/dict/lexicon/` directories exist

**Memory Issues**
- Large datasets may require significant RAM
- Consider processing in batches

## 📋 File Changes Summary

**Renamed Files:**
- `qa.py` → `validator.py`
- `morphus_loader.py` → `morphhb.py`

**New Files:**
- `cli.py` - Unified command interface
- `__init__.py` - Package marker
- `__main__.py` - CLI entry point
- `lexicon/__init__.py` - Lexicon package
- `verses/__init__.py` - Verses package
- `lexicon/consolidate.py` - Consolidation logic

**Removed:**
- `temp/` directory (archived scripts)

---

*This unified CLI architecture ensures professional, maintainable, and scalable Hebrew Scripture processing.*

## 📁 Directory Structure

```
scripts/dict/
├── README.md                        # This documentation
├── utils.py                         # ⭐ Shared utilities (JSON I/O, validation, etc.)
├── lexicon_100_percent_list.json    # Complete Strong's numbers list
├── config.py                        # Configuration and paths
├── book_mappings.py                 # Book name mappings
│
├── build_lexicon.py                 # 🏗️ Main lexicon builder
├── build_verses.py                  # 🏗️ Main verse builder
├── qa.py                            # ✅ Quality assurance
├── rebuild_lexicon_consolidated.py  # 🔄 Rebuild consolidated files  
├── integrate_custom_dict.py         # 📖 Custom dictionary integration
│
├── strong_processor.py              # Strong's number processing
├── morphus_loader.py                # Morphological data loader
├── verse_processor.py               # Verse processing logic
│
├── translation/                     # 🌍 Translation package
│   ├── README.md                    # Translation documentation
│   ├── config.py                    # Translation configuration
│   ├── translator.py                # Grok API client
│   ├── processor.py                 # Translation processor
│   ├── main.py                      # CLI entry point
│   └── fix_mismatches.py            # Fix missing translations
│
└── temp/                            # 📦 Archived scripts
    ├── README.md                    # Archive documentation
    ├── diagnostics/                 # One-time diagnostic scripts
    ├── fixes/                       # One-time fix scripts
    ├── legacy/                      # Old script versions
    └── tests/                       # Manual test scripts
```

## 🚀 Main Scripts

### 1. `build_lexicon.py` - Lexicon Builder

**Purpose**: Builds complete Hebrew lexicon entries with definitions, senses, and references.

```bash
# Build complete lexicon (production)
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json

# Build complete lexicon (update existing)
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json --update

# Testing mode (1% sample for development)
python scripts/dict/build_lexicon.py lexicon_100_percent_list.json --testing

# Single entry
python scripts/dict/build_lexicon.py H7965

# Fill missing definitions
python scripts/dict/build_lexicon.py --fill-missing
```

**Features:**
- ✅ BDB (Brown-Driver-Briggs) definitions with sense assignment
- ✅ Strong's concordance references
- ✅ Automatic root identification and linking
- ✅ Morphological analysis integration
- ✅ Quality validation and cross-referencing

### 2. `build_verses.py` - Verse Builder

**Purpose**: Generates lightweight verse JSON files for all Hebrew Scripture books.

```bash
# Build all books
python scripts/dict/build_verses.py

# Build specific book
python scripts/dict/build_verses.py --book genesis

# Build specific chapter
python scripts/dict/build_verses.py --book exodus --chapter 1

# Verbose output
python scripts/dict/build_verses.py --verbose
```

**Features:**
- ✅ ISR Hebrew text processing
- ✅ Morphological analysis integration (BDB senses)
- ✅ Strong's number extraction and validation
- ✅ Multi-book support (Genesis through Malachi)
- ✅ Lightweight JSON format for optimal performance

## 🔧 Support Scripts

### `qa.py` - Quality Assurance

**Purpose**: Validates lexicon data quality and structure.

```bash
# Full validation
python scripts/dict/qa.py

# Quick validation
python scripts/dict/qa.py --quick
```

**Validates:**
- File structure and naming conventions
- JSON validity and required fields
- Cross-references between words and roots
- Strong's coverage and occurrences
- Sense hierarchy completeness
- Definition completeness

## 📊 Data Flow

```
Raw Data (data/dict/raw/)
    ├── ISR Hebrew text (oe/)
    ├── BDB XML (BrownDriverBriggs.xml)
    ├── Strong's dictionaries
    └── Morphological analysis (morphus/)

           ↓ build_lexicon.py

Lexicon Data (data/dict/lexicon/)
    ├── words/ - Derived words with definitions
    ├── roots/ - Primitive roots
    └── testing/ - Development samples

           ↓ build_verses.py

Verse Data (data/dict/verses/)
    ├── genesis/ - Lightweight verse files
    ├── exodus/ - ...
    └── ... (all books)
```

## ⚙️ Configuration

### `config.py`

Central configuration file containing:
- Project paths and directories
- File locations for raw data
- Output directory settings
- Lexicon processing parameters

### `book_mappings.py`

Contains mappings for:
- Book names across different sources (ISR, TS2009, TTH)
- Normalized book identifiers
- Morphological analysis file mappings
- Multilingual book names

### `utils.py` - Shared Utilities

Central utilities module providing common functionality:

**JSON Operations:**
- `load_json()` - Load JSON with proper error handling
- `save_json()` - Save pretty-printed JSON
- `save_json_minified()` - Save minified JSON for production
- `extract_json_array_robust()` - Extract JSON from LLM responses (4-strategy approach)
- `find_largest_json_array()` - Bracket-matching algorithm for nested JSON

**Validation:**
- `validate_strong_number()` - Validate Strong's number format
- `validate_file_exists()` - Check file/directory existence
- `validate_translation_field()` - Validate translations
- `validate_lexicon_entry()` - Complete entry validation

**Path Utilities:**
- `ensure_dir()` - Create directories if needed
- `get_project_root()` - Find project root directory

**Batch Processing:**
- `chunk_list()` - Split lists into chunks
- `batch_processor()` - Decorator for batch processing

**Progress & Stats:**
- `ProgressTracker` - Track long-running operations
- `StatisticsCollector` - Collect and report statistics
- `create_backup()` - Create timestamped backups

## 🔧 Development Guidelines

### Adding New Features

1. **Modular Design**: Keep functionality in separate modules
2. **Configuration**: Use `config.py` for paths and settings
3. **Testing**: Use `--testing` mode for development
4. **Validation**: Run `qa.py` after changes

### Code Organization

- **`config.py`**: All paths and configuration
- **`book_mappings.py`**: Book-related mappings and metadata
- **`strong_processor.py`**: Strong's number processing logic
- **`morphus_loader.py`**: XML morphological data loading
- **`verse_processor.py`**: Verse generation logic
- **`build_*.py`**: Main entry points and orchestration

### Data Validation

Always run QA checks after making changes:

```bash
# Quick validation
python scripts/dict/qa.py --quick

# Full validation
python scripts/dict/qa.py
```

## 🌍 Translation

The `translation/` package provides automated translation of English definitions to multiple languages using xAI's Grok API.

### Quick Start

```bash
# Translate entire lexicon to Spanish (default batch size: 50)
python -m scripts.dict.translation.main --language es

# Translate with larger batch size for faster processing (recommended: 500)
python -m scripts.dict.translation.main --language es --batch-size 500

# Translate specific file
python -m scripts.dict.translation.main --file roots --language es --batch-size 500

# Translate both files with optimal batch size
python -m scripts.dict.translation.main --language es --batch-size 500

# Translate single entry
python -m scripts.dict.translation.main --strong H1 --language es

# Dry run to preview (no API calls, no changes saved)
python -m scripts.dict.translation.main --language es --batch-size 500 --dry-run

# Fix missing translations with large batches
python scripts/dict/translation/fix_mismatches.py --language es --batch-size 500
```

### Batch Size Recommendations

- **Small batches (50-100)**: More granular progress, better for testing
- **Medium batches (200-300)**: Good balance of speed and reliability
- **Large batches (500)**: ⭐ **Recommended for production** - fastest processing, fewer API calls
- **Maximum**: 1000 definitions per batch (but 500 is more reliable)

**Note**: Larger batches significantly reduce total translation time. The Spanish translation (15,101 definitions) took ~35 minutes with batch size 500.

### Features

- ✅ Batch translation (1-1000 definitions per call, default: 50, recommended: 500)
- ✅ Cross-entry batching for efficiency
- ✅ Robust JSON extraction (4-strategy approach)
- ✅ Automatic mismatch handling (pad/truncate)
- ✅ Progress tracking with ETA
- ✅ Validation before saving
- ✅ Dry-run mode

**See [`translation/README.md`](translation/README.md) for detailed documentation.**

## 📦 Archived Scripts (`temp/`)

The `temp/` directory contains one-time scripts that have completed their purpose:

- **diagnostics/** - Scripts that identified data issues (homonyms, empty translations, etc.)
- **fixes/** - Scripts that corrected identified issues (254 homonym fixes, 10 empty translations)
- **legacy/** - Old versions of main scripts (lexicon_builder.py, verse_builder_backup.py)
- **tests/** - Manual test scripts

These scripts are preserved for historical reference and should not be run again unless encountering similar issues with new data.

**See [`temp/README.md`](temp/README.md) for complete archive documentation.**

## 📈 Production Usage

### Complete Pipeline

```bash
# 1. Build complete lexicon
cd scripts/dict
python build_lexicon.py lexicon_100_percent_list.json

# 2. Build all verse files
python build_verses.py

# 3. Validate results
python qa.py
```

### Development Workflow

```bash
# 1. Test with small sample
python build_lexicon.py lexicon_100_percent_list.json --testing

# 2. Validate testing data
python qa.py

# 3. Run on full dataset when ready
python build_lexicon.py lexicon_100_percent_list.json
```

## 🛠️ Troubleshooting

### Common Issues

**Permission Errors**
- Run scripts with appropriate permissions
- Check file/directory access rights

**Missing Dependencies**
- Ensure all required data files exist in `data/dict/raw/`
- Check that `data/dict/lexicon/` directories exist

**Path Errors**
- Scripts expect to be run from `scripts/dict/` directory
- Use relative paths or update `config.py` if needed

**Memory Issues**
- Large datasets may require significant RAM
- Consider processing in batches for very large operations

## 📋 File Descriptions

| File | Purpose |
|------|---------|
| `build_lexicon.py` | Main lexicon generation script |
| `build_verses.py` | Main verse generation script |
| `qa.py` | Quality assurance and validation |
| `config.py` | Configuration and path management |
| `book_mappings.py` | Book name mappings and metadata |
| `strong_processor.py` | Strong's number processing |
| `morphus_loader.py` | Morphological XML data loading |
| `verse_processor.py` | Verse processing logic |
| `lexicon_100_percent_list.json` | Complete Strong's numbers list |
| `*backup.py` | Legacy versions (for reference) |

## 🔄 Version History

- **v1.0**: Initial modular refactor
- **Legacy**: `lexicon_builder.py` and `verse_builder.py` (preserved as backup)

---

*This modular architecture ensures maintainable, testable, and scalable Hebrew Scripture processing.*
