"""Complete the BDB glosses that the lexicon stored cut off, such as "be" for "be or act as adversary".

    python -m scripts.dict.bdb_truncated_glosses --check
    python -m scripts.dict.bdb_truncated_glosses --write
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from .build_lexicon import NS, def_gloss_parts
from .config import config

SPANISH_FILE = config.LEXICON_DIR / "bdb_completed_glosses_es.json"
LEXICON_FILES = ("words.json", "roots.json")
SHARD_DIRS = (config.LEXICON_WORDS_DIR, config.LEXICON_ROOTS_DIR)


@dataclass(frozen=True)
class Completion:
    before: str
    after: str
    absorbed: tuple[str, ...]


@dataclass(frozen=True)
class Repair:
    strong: str
    order: int
    before: str
    after: str
    absorbed_orders: tuple[int, ...]


def bdb_completions(bdb_root: ET.Element) -> dict[str, list[Completion]]:
    by_entry: dict[str, list[Completion]] = {}
    tag = f"{{{NS['bdb']}}}"
    for entry in bdb_root.iter(f"{tag}entry"):
        for parent in [entry, *entry.iter(f"{tag}sense")]:
            for gloss, (first, *absorbed) in def_gloss_parts(parent):
                if gloss != first:
                    by_entry.setdefault(entry.get("id"), []).append(Completion(first, gloss, tuple(absorbed)))
    return by_entry


def repairs_for(strong: str, entry: dict, found: list[Completion]) -> list[Repair]:
    definitions = sorted((d for d in entry.get("definitions", []) if d.get("source") == "bdb"), key=lambda d: d.get("order", 0))
    texts = [(d.get("text_en") or "").strip() for d in definitions]
    repairs: dict[int, Repair] = {}
    for completion in found:
        width = len(completion.absorbed)
        for index, text in enumerate(texts):
            if text == completion.before.strip() and tuple(texts[index + 1: index + 1 + width]) == completion.absorbed:
                order = definitions[index]["order"]
                absorbed = tuple(definitions[index + 1 + offset]["order"] for offset in range(width))
                repairs.setdefault(order, Repair(strong, order, completion.before, completion.after, absorbed))
    afters: dict[str, set[str]] = {}
    for completion in found:
        afters.setdefault(completion.before.strip(), set()).add(completion.after)
    matched = {repair.before.strip() for repair in repairs.values()}
    for index, text in enumerate(texts):
        order = definitions[index]["order"]
        if text in afters and text not in matched and len(afters[text]) == 1 and order not in repairs:
            repairs[order] = Repair(strong, order, text, next(iter(afters[text])), ())
    return sorted(repairs.values(), key=lambda repair: repair.order)


def derive(lexicon: dict[str, dict], bdb_root: ET.Element, strong_to_bdb: dict[str, list[str]]) -> list[Repair]:
    found = bdb_completions(bdb_root)
    repairs = []
    for strong, entry in sorted(lexicon.items()):
        candidates = [completion for bdb_id in strong_to_bdb.get(strong, []) for completion in found.get(bdb_id, [])]
        if candidates:
            repairs.extend(repairs_for(strong, entry, candidates))
    return repairs


def apply(entry: dict, repairs: list[Repair], spanish: dict[str, str]) -> None:
    by_order = {repair.order: repair for repair in repairs}
    dropped = {order for repair in repairs for order in repair.absorbed_orders}
    kept = []
    for definition in entry["definitions"]:
        order = definition.get("order")
        if definition.get("source") == "bdb" and order in dropped:
            continue
        if definition.get("source") == "bdb" and order in by_order:
            definition["text_en"] = by_order[order].after
            definition["text_es"] = spanish[by_order[order].after]
        kept.append(definition)
    entry["definitions"] = kept


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    trailing = path.read_text(encoding="utf-8").endswith("\n")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + ("\n" if trailing else ""), encoding="utf-8")


def strong_to_bdb() -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = {}
    for xref in ET.parse(config.LEXICAL_INDEX).getroot().iter(f"{{{NS['bdb']}}}xref"):
        if xref.get("strong") and xref.get("bdb"):
            mapping.setdefault(f"H{xref.get('strong')}", []).append(xref.get("bdb"))
    return mapping


def lexicon_repairs() -> tuple[dict[str, dict], list[Repair]]:
    from .utils import load_bdb_xml

    lexicon = {}
    for name in LEXICON_FILES:
        lexicon.update(read_json(config.LEXICON_DIR / name))
    return lexicon, derive(lexicon, load_bdb_xml(), strong_to_bdb())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    for flag in ("--check", "--write"):
        mode.add_argument(flag, action="store_true")
    args = parser.parse_args(argv)

    _, repairs = lexicon_repairs()
    spanish = read_json(SPANISH_FILE)
    missing = sorted({repair.after for repair in repairs} - set(spanish))
    for repair in repairs:
        print(f"{repair.strong}:{repair.order}\t{repair.before!r} -> {repair.after!r}\t{spanish.get(repair.after)!r}")
    if missing:
        print(f"{len(missing)} completed glosses have no Spanish in {SPANISH_FILE.name}: {missing}")
        return 1
    if args.write and repairs:
        by_strong: dict[str, list[Repair]] = {}
        for repair in repairs:
            by_strong.setdefault(repair.strong, []).append(repair)
        for name in LEXICON_FILES:
            path = config.LEXICON_DIR / name
            data = read_json(path)
            for strong in by_strong.keys() & data.keys():
                apply(data[strong], by_strong[strong], spanish)
            write_json(path, data)
        for strong, rows in by_strong.items():
            for directory in SHARD_DIRS:
                shard = directory / f"{strong}.json"
                if shard.exists():
                    data = read_json(shard)
                    apply(data, rows, spanish)
                    write_json(shard, data)
        _, repairs = lexicon_repairs()
    print(f"{len(repairs)} truncated BDB glosses left in the lexicon")
    return 1 if repairs else 0


if __name__ == "__main__":
    sys.exit(main())
