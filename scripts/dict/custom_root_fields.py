#!/usr/bin/env python3
"""Drop empty-string root fields from custom lexicon entries so readers fall back to the lexicon root."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CUSTOM = ROOT / "data/dict/lexicon/custom_definitions.json"
FIELDS = ("root", "root_strong")


def empty_root_fields(entries: dict) -> list[tuple[str, str]]:
    return [(key, field) for key, entry in entries.items() for field in FIELDS if entry.get(field) == ""]


def drop_empty_root_fields(entries: dict) -> dict:
    return {key: {field: value for field, value in entry.items() if not (field in FIELDS and value == "")} for key, entry in entries.items()}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["write", "check"])
    args = parser.parse_args(argv)
    entries = json.loads(CUSTOM.read_text(encoding="utf-8"))
    found = empty_root_fields(entries)
    if args.command == "check":
        print(f"{len(found)} empty root fields")
        return 1 if found else 0
    CUSTOM.write_text(json.dumps(drop_empty_root_fields(entries), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"dropped {len(found)} empty root fields")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
