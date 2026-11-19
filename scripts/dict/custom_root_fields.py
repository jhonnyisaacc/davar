#!/usr/bin/env python3
"""Keep custom lexicon root fields honest: no empty strings, and no primitive word pointing to a root other than itself."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CUSTOM = ROOT / "data/dict/lexicon/custom_definitions.json"
STRONGS = ROOT / "data/dict/raw/strongs_hebrew_dict_en.json"
FIELDS = ("root", "root_strong")


def empty_root_fields(entries: dict) -> list[tuple[str, str]]:
    return [(key, field) for key, entry in entries.items() for field in FIELDS if entry.get(field) == ""]


def primitive_with_foreign_root(entries: dict, strongs: dict) -> list[tuple[str, str]]:
    return [
        (key, entry["root_strong"])
        for key, entry in entries.items()
        if entry.get("root_strong") not in (None, "", key)
        and strongs.get(key, {}).get("derivation", "").startswith("a primitive")
    ]


def fix_root_fields(entries: dict, strongs: dict) -> dict:
    foreign = {key for key, _ in primitive_with_foreign_root(entries, strongs)}
    return {
        key: {
            field: value
            for field, value in entry.items()
            if not (field in FIELDS and (value == "" or key in foreign))
        }
        for key, entry in entries.items()
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["write", "check"])
    args = parser.parse_args(argv)
    entries = json.loads(CUSTOM.read_text(encoding="utf-8"))
    strongs = json.loads(STRONGS.read_text(encoding="utf-8"))
    empty = empty_root_fields(entries)
    foreign = primitive_with_foreign_root(entries, strongs)
    if args.command == "check":
        print(f"{len(empty)} empty root fields, {len(foreign)} primitive words with a foreign root")
        for key, root in foreign:
            print(f"  {key} -> {root}")
        return 1 if empty or foreign else 0
    CUSTOM.write_text(json.dumps(fix_root_fields(entries, strongs), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"dropped {len(empty)} empty root fields and the root of {len(foreign)} primitive words")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
