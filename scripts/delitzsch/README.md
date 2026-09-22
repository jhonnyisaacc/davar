# Delitzsch Strong's Matcher

A fast, lightweight Python script suite for processing Delitzsch Hebrew New Testament texts and matching words to Strong's numbers with Hebrew prefix identification.

Location: `scripts/delitzsch`.

## Overview

This tool processes the Delitzsch Hebrew New Testament (דבר) and transforms it from verse-level text into word-level data with Strong's number assignments, similar to the OE (OpenScriptures Enhanced) format.

## Features

- **Fast Processing**: Optimized for large Hebrew text corpora
- **Prefix Detection**: Identifies Hebrew prefixes (בְּ, לְ, כְּ, מִ, וְ, הַ, שֶׁ)
- **Strong's Matching**: Matches word stems to Strong's Hebrew numbers
- **Flexible Output**: Structured by book/chapter like OE format
- **Error Logging**: Tracks unmatched words for review

## Installation

No special installation required. Ensure Python 3.8+ is available and run from the project root:

```bash
cd ~/davar
python scripts/delitzsch/cli.py --help
```

## Usage

### Canonical CLI

```bash
python scripts/delitzsch/cli.py run --help
python scripts/delitzsch/cli.py audit --help
python scripts/delitzsch/cli.py normalize --help
```

### Process All Books

```bash
python scripts/delitzsch/cli.py run
```

### Process Specific Book

```bash
python scripts/delitzsch/cli.py run --book acts
```

### Dry Run (Preview Only)

```bash
python scripts/delitzsch/cli.py run --dry-run
```

### Verbose Output

```bash
python scripts/delitzsch/cli.py run --verbose
```

### Script Entrypoints

Direct script entrypoints are available in this folder:

```bash
python scripts/delitzsch/run_matcher.py --help
python scripts/delitzsch/audit_delitzsch_parsing.py --help
python scripts/delitzsch/normalize_delitzsch_prefixes.py --help
```

## Output Format

Produces JSON files structured as:

```json
[
  {
    "chapter": 1,
    "hebrew_letter": "א",
    "verses": [
      {
        "chapter": 1,
        "verse": 1,
        "hebrew": "בְּמַּאֲמָר הָרִאשׁוֹן...",
        "words": [
          {
            "text": "בְּמַּאֲמָר",
            "strong": "Hb/H561",
            "prefixes": ["Hb"]
          }
        ]
      }
    ]
  }
]
```

## Architecture

### Core Modules

- **`config.py`**: Path configuration and utilities
- **`hebrew_utils.py`**: Hebrew text processing (nikud stripping, tokenization, normalization)
- **`dictionary_loader.py`**: Loads and indexes Hebrew dictionaries for fast lookups
- **`word_matcher.py`**: Core matching logic for prefixes and Strong's numbers
- **`matcher_runner.py`**: Processing orchestration for run workflows
- **`cli.py`**: Canonical modular CLI with subcommands (`run`, `audit`, `normalize`)

### Data Sources

- **Delitzsch Texts**: `data/delitzsch/*.json` - Source Hebrew NT texts
- **Words Dictionary**: `data/dict/lexicon/words.json` - Strong's word mappings
- **Roots Dictionary**: `data/dict/lexicon/roots.json` - Root word mappings
- **Prefix Data**: `data/dict/prefixes/` - Hebrew prefix forms and definitions

## Matching Algorithm

1. **Tokenization**: Split verses on whitespace and maqaf (־)
2. **Prefix Detection**:
   - First: Exact form matching from `forms_lookup.json`
   - Fallback: Common prefix character detection
3. **Stem Normalization**: Strip nikud, normalize final forms
4. **Dictionary Lookup**: Check words, then roots dictionaries
5. **Result Formatting**: Combine prefixes with Strong's numbers (e.g., "Hb/H561")

## Output Structure

```
data/delitzsch/parsed/
├── acts/
│   ├── 1.json
│   ├── 2.json
│   └── ...
├── matthew/
│   ├── 1.json
│   └── ...
└── ... (27 NT books total)
```

## Error Handling

- **Unmatched Words**: Logged to `scripts/delitzsch/unmatched_words.log`
- **Processing Errors**: Continue with next word/book on individual failures
- **JSON Validation**: Output validated before writing

## Performance

- **Dictionary Loading**: ~30-60 seconds initial load (cached singleton)
- **Processing Speed**: ~1000+ verses/minute after loading
- **Memory Usage**: ~500MB peak during dictionary loading

## Limitations

- **No Morphological Analysis**: Simplified matching without full morphological parsing
- **Prefix Ambiguity**: Some forms may have multiple prefix interpretations
- **NT Scope**: Designed specifically for New Testament Hebrew (Delitzsch)

## Contributing

For the Davar project, ensure changes maintain:

- Minimalist, sacred focus
- RTL Hebrew compatibility
- Offline-first design
- Content licensing respect
