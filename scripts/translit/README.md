# Transliteration Pipeline (Per-Word)

This module generates per-word transliterations for Tanakh and Besorah source texts using local transliteration rules. It reads word-level verse data and writes per-book JSON outputs.

## Goals

- Transliterate actual verse words (not Strong's entries)
- Output simple, readable English and Spanish transliterations
- Preserve alignment to book, chapter, verse, and word index
- Keep output aligned to the source data

## Output

Each book produces a `book.json` file in [data/translit](data/translit):

- `book_id`, `source`, `language_targets`, `generated_at`
- `verses[]` with `chapter`, `verse`, and `words[]`
- each word includes `id`, original fields, and `translit_en`/`translit_es`

## Input Sources

- Tanakh: [data/oe](data/oe)
- Besorah: [data/delitzsch_parsed](data/delitzsch_parsed)
- DSS variants: [data/dss/books](data/dss/books) (differences only)

## Files

- `config.py` - paths, model, pricing, batching defaults
- `models.py` - data structures
- `batcher.py` - mixed batching by verse + token budget
- `local_processor.py` - local per-book orchestration
- `qa.py` - output validation
- `benchmark.py` - reproducible benchmark scorer and exact-match gate
- `main.py` - CLI entry point

## Notes

- Uses local transliteration rules only (no external API calls).
- `data/translit/benchmark.json` is the approved Tanakh baseline. It covers
  vowels/sheva, prefix clusters, proper names, sacred-name policy, final-heh,
  and common study vocabulary. Run `PYTHONPATH=. python -m
  scripts.translit.benchmark data/translit/benchmark.json --fail-under 1.0`.
  The JSON report records every actual output and both exact and normalized
  rates, making regressions reproducible in CI. Besorah cases can be added to
  a separate fixture and scored by the same harness after Tanakh review.

## How to Run

Run commands from the project root: `/Users/jhonny/davar`

### List available books

```bash
python -m scripts.translit.main --corpus tanakh --list-books
python -m scripts.translit.main --corpus besorah --list-books
```

### Transliterate a single book

```bash
# Dry-run (no file written)
python -m scripts.translit.main --corpus tanakh --book genesis --dry-run

# Write output
python -m scripts.translit.main --corpus besorah --book john

# DSS variants (differences only)
python -m scripts.translit.main --corpus dss --book 1samuel

# DSS variants with xAI vocalization (niqqud), then local transliteration
python -m scripts.translit.main --corpus dss --book 1samuel --use-xai-vocalization

# DSS with explicit per-request character budget for lower API call count
python -m scripts.translit.main --corpus dss --book 1samuel --use-xai-vocalization --max-chars-per-request 12000
```

### Local mode (default)

```bash
# Local dry-run
python -m scripts.translit.main --corpus besorah --book john --dry-run
```

### Transliterate all books in a corpus

```bash
# Dry-run entire Tanakh
python -m scripts.translit.main --corpus tanakh --book all --dry-run

# Process entire Besorah
python -m scripts.translit.main --corpus besorah --book all
```

### Control batch size

```bash
python -m scripts.translit.main --corpus tanakh --book genesis --token-budget 8000
```

### Verbose logging

```bash
python -m scripts.translit.main --corpus tanakh --book genesis --verbose
```
