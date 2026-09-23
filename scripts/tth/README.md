# TTH2 Processing System

Simple pipeline to convert TTH DOCX files into JSON for Davar.

## Quick Start

```bash
pip install mammoth tqdm
python -m scripts.tth.main all
```

Output: `data/tth/json/`

## Main Commands

```bash
# List supported book keys
python -m scripts.tth.main books

# Full pipeline (split + convert + postprocess)
python -m scripts.tth.main all

# Step-by-step
python -m scripts.tth.main split
python -m scripts.tth.main convert all
python -m scripts.tth.main postprocess all
```

## Process One Book

```bash
# Apocalipsis (book key is sodot)
python -m scripts.tth.main process data/tth/raw/apocalipsis.docx --books sodot

# Generic single-book example
python -m scripts.tth.main process data/tth/raw/romanos.docx --books romanos
```

If filename and book key are the same, you can omit `--books`:

```bash
python -m scripts.tth.main process data/tth/raw/romanos.docx
```

Note: for Apocalipsis, keep `--books sodot` because filename is `apocalipsis` but the registered key is `sodot`.

## Useful Commands

```bash
# Convert one already-split markdown book
python -m scripts.tth.main convert amos

# Postprocess one book
python -m scripts.tth.main postprocess lukas

# Validate one book or all
python -m scripts.tth.main validate sodot
python -m scripts.tth.main validate all

# Help
python -m scripts.tth.main --help
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

- Book availability and the DOCX-to-books map live in `data/tth/books.json`. `scripts/tth/config.py` loads them as `BOOKS_INFO` and `DOCX_BOOKS`.
- Add new books in that file first, then run `books` to confirm they are registered.
- `postprocess` converts markdown italics to `<em>` and fixes common formatting artifacts.
