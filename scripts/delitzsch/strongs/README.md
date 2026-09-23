# Delitzsch Strong's assignment

Dictionary matching for Hebrew words in the Delitzsch New Testament that still have a null Strong's number, and the merge of those assignments into the verse files. The implementation is `scripts/delitzsch/strongs/v2/`. It does not call an API.

## Assign

The matcher reads the Hebrew dictionary at `data/dict/raw/dict_backup/raw/strongs_hebrew_dict_en.json` and writes one JSON file per book to `data/delitzsch/parsed/strongs/v2/<book>.json`.

```bash
python -m scripts.delitzsch.strongs.v2 --book jude
python -m scripts.delitzsch.strongs.v2 --all
python -m scripts.delitzsch.strongs.v2 --book jude --force
python -m scripts.delitzsch.strongs.v2 --book jude --verbose
python -m scripts.delitzsch.strongs.v2 --book jude --stats
```

Pass `--book` or `--all`. `--force` rewrites an existing output file. `--verbose` (`-v`) turns on debug logging. `--stats` prints dictionary counts after a single book.

Books: matthew, mark, luke, john, acts, romans, corinthians1, corinthians2, galatians, ephesians, philippians, colossians, thessalonians1, thessalonians2, timothy1, timothy2, titus, philemon, hebrews, james, peter1, peter2, john1, john2, john3, jude, revelation.

Each output file records `book`, `total_null_words`, `total_assigned`, `total_failed`, `total_skipped`, and per-chapter `assignments`. An assignment `type` is `strong`, `failed`, or `skipped`.

## Merge

`merge_strongs.py` copies assignments from `data/delitzsch/parsed/strongs/v2/<book>.json` into the parsed verse data. It writes `data/delitzsch/review/reports/merge_strongs_report.json` unless `--report` is set.

```bash
python scripts/delitzsch/strongs/v2/merge_strongs.py
python scripts/delitzsch/strongs/v2/merge_strongs.py --book colossians
python scripts/delitzsch/strongs/v2/merge_strongs.py --dry-run
```

`tests/test_merge_strongs.py` imports `scripts.delitzsch.strongs.v2.merge_strongs`.

## Layout

```
scripts/delitzsch/strongs/
├── README.md
└── v2/
    ├── __init__.py
    ├── __main__.py
    ├── config.py
    ├── debug_matcher.py
    ├── dictionary_index.py
    ├── matcher.py
    ├── merge_strongs.py
    ├── normalizer.py
    └── processor.py
```
