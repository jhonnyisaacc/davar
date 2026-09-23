# Delitzsch Strong's merge

`merge_strongs.py` copies Strong's assignments from `data/delitzsch/parsed/strongs/v2/<book>.json` into the parsed verse data. It writes `data/delitzsch/review/reports/merge_strongs_report.json` unless `--report` is set.

```bash
python scripts/delitzsch/strongs/v2/merge_strongs.py
python scripts/delitzsch/strongs/v2/merge_strongs.py --book colossians
python scripts/delitzsch/strongs/v2/merge_strongs.py --dry-run
```

`tests/test_merge_strongs.py` imports `scripts.delitzsch.strongs.v2.merge_strongs`. `scripts/delitzsch/review/remediate.py` reads `data/delitzsch/parsed/strongs/v2`.

## Layout

```
scripts/delitzsch/strongs/
├── README.md
└── v2/
    └── merge_strongs.py
```
