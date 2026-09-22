# TTH2 Processing System

Simple pipeline to convert TTH DOCX files into JSON for Davar.

## Quick Start

```bash
cd ~/davar
pip install mammoth tqdm
python scripts/tth/main.py all
```

Output: `data/tth/json/`

## Main Commands

```bash
# List supported book keys
python scripts/tth/main.py books

# Full pipeline (split + convert + postprocess)
python scripts/tth/main.py all

# Step-by-step
python scripts/tth/main.py split
python scripts/tth/main.py convert all
python scripts/tth/main.py postprocess all
```

## Process One Book

```bash
# Apocalipsis (book key is sodot)
python scripts/tth/main.py process data/tth/raw/apocalipsis.docx --books sodot

# Generic single-book example
python scripts/tth/main.py process data/tth/raw/romanos.docx --books romanos
```

If filename and book key are the same, you can omit `--books`:

```bash
python scripts/tth/main.py process data/tth/raw/romanos.docx
```

Note: for Apocalipsis, keep `--books sodot` because filename is `apocalipsis` but the registered key is `sodot`.

## Useful Commands

```bash
# Convert one already-split markdown book
python scripts/tth/main.py convert amos

# Postprocess one book
python scripts/tth/main.py postprocess lukas

# Validate one book or all
python scripts/tth/main.py validate sodot
python scripts/tth/main.py validate all

# Help
python scripts/tth/main.py --help
```

## Folder Layout

```text
data/tth/
  raw/        # source DOCX files
  markdown/   # per-book markdown files
  json/       # final JSON files

scripts/tth/
  main.py
  config.py
  docx_to_md.py
  book_splitter.py
  md_to_json.py
  json_postprocess.py
  text_cleaner.py
```

## JSON Shape

Each book is a single JSON file:

```json
{
  "book_info": {
    "book_id": "amos",
    "tth_name": "Amos",
    "hebrew_name": "עמוס",
    "section": "neviim",
    "total_chapters": 9,
    "total_verses": 146
  },
  "chapters": [
    {
      "chapter": 1,
      "verses": [
        {
          "verse": 1,
          "tth": "...",
          "footnotes": [],
          "hebrew_terms": []
        }
      ]
    }
  ]
}
```

## Notes

- Book availability and extraction rules come from `scripts/tth/config.py` (`BOOKS_INFO`).
- Add new books there first, then run `books` to confirm they are registered.
- `postprocess` converts markdown italics to `<em>` and fixes common formatting artifacts.
