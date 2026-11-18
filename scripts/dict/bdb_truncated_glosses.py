"""Complete the BDB glosses that the lexicon stored cut off, such as "be" for "be or act as adversary", and drop cut-off glosses stored under the wrong entry.

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

from .build_lexicon import DIVINE_NAME, DIVINE_NAME_ABBREVIATION, INCOMPLETE_GLOSS_ENDINGS, NS, def_gloss_parts
from .config import config

SPANISH_FILE = config.LEXICON_DIR / "bdb_completed_glosses_es.json"
LEXICON_FILES = ("words.json", "roots.json")
SHARD_DIRS = (config.LEXICON_WORDS_DIR, config.LEXICON_ROOTS_DIR)
LONE_PREPOSITIONS = {"in", "to", "at", "on", "with", "from", "for", "by", "into", "of", "as"}


@dataclass(frozen=True)
class Completion:
    after: str
    defs: tuple[str, ...]
    stages: tuple[tuple[str, int], ...]


@dataclass(frozen=True)
class Repair:
    strong: str
    order: int
    before: str
    after: str | None
    absorbed_orders: tuple[int, ...]


def bdb_completions(bdb_root: ET.Element) -> dict[str, list[Completion]]:
    by_entry: dict[str, list[Completion]] = {}
    tag = f"{{{NS['bdb']}}}"
    for entry in bdb_root.iter(f"{tag}entry"):
        for parent in [entry, *entry.iter(f"{tag}sense")]:
            for part in def_gloss_parts(parent):
                if len(part.stages) > 1:
                    by_entry.setdefault(entry.get("id"), []).append(Completion(part.text, tuple(part.defs), tuple(part.stages)))
    return by_entry


def stored_form(text: str) -> str:
    return text.strip().replace(DIVINE_NAME_ABBREVIATION, DIVINE_NAME)


def entry_glosses(bdb_entry: ET.Element) -> set[str]:
    tag = f"{{{NS['bdb']}}}"
    glosses = {d.text.strip() for d in bdb_entry.iter(f"{tag}def") if d.text}
    for parent in [bdb_entry, *bdb_entry.iter(f"{tag}sense")]:
        for part in def_gloss_parts(parent):
            glosses.update(stored_form(stage) for stage, _ in part.stages)
    return glosses


def is_truncated(text: str) -> bool:
    words = text.lower().split()
    return bool(words) and words[-1] in INCOMPLETE_GLOSS_ENDINGS and words != [words[-1]] or len(words) == 1 and words[0] in INCOMPLETE_GLOSS_ENDINGS - LONE_PREPOSITIONS


def repairs_for(strong: str, entry: dict, found: list[Completion], own: set[str], foreign: set[str]) -> list[Repair]:
    definitions = sorted((d for d in entry.get("definitions", []) if d.get("source") == "bdb"), key=lambda d: d.get("order", 0))
    texts = [stored_form(d.get("text_en") or "") for d in definitions]
    raw = [(d.get("text_en") or "").strip() for d in definitions]
    repairs: dict[int, Repair] = {}
    for completion in found:
        for stage, consumed in completion.stages:
            rest = tuple(stored_form(text) for text in completion.defs[consumed:])
            for index, text in enumerate(texts):
                if text != stage or raw[index] == completion.after or tuple(texts[index + 1: index + 1 + len(rest)]) != rest:
                    continue
                order = definitions[index]["order"]
                absorbed = tuple(definitions[index + 1 + offset]["order"] for offset in range(len(rest)))
                repairs.setdefault(order, Repair(strong, order, raw[index], completion.after, absorbed))
    afters: dict[str, set[str]] = {}
    for completion in found:
        afters.setdefault(stored_form(completion.defs[0]), set()).add(completion.after)
    matched = {stored_form(repair.before) for repair in repairs.values()}
    for index, text in enumerate(texts):
        order = definitions[index]["order"]
        if order in repairs:
            continue
        if text in afters and text not in matched and len(afters[text]) == 1 and next(iter(afters[text])) not in raw:
            repairs[order] = Repair(strong, order, raw[index], next(iter(afters[text])), ())
        elif text not in own and text in foreign and is_truncated(text):
            repairs[order] = Repair(strong, order, raw[index], None, ())
    return sorted(repairs.values(), key=lambda repair: repair.order)


def derive(lexicon: dict[str, dict], bdb_root: ET.Element, strong_to_bdb: dict[str, list[str]]) -> list[Repair]:
    found = bdb_completions(bdb_root)
    entries = {entry.get("id"): entry for entry in bdb_root.iter(f"{{{NS['bdb']}}}entry")}
    foreign = {stored_form(stage) for completions in found.values() for completion in completions for stage, _ in completion.stages[:-1]}
    repairs = []
    for strong, entry in sorted(lexicon.items()):
        bdb_ids = [bdb_id for bdb_id in strong_to_bdb.get(strong, []) if bdb_id in entries]
        if not bdb_ids:
            continue
        own = set().union(*(entry_glosses(entries[bdb_id]) for bdb_id in bdb_ids))
        candidates = [completion for bdb_id in bdb_ids for completion in found.get(bdb_id, [])]
        repairs.extend(repairs_for(strong, entry, candidates, own, foreign))
    return repairs


def apply(entry: dict, repairs: list[Repair], spanish: dict[str, str]) -> None:
    by_order = {repair.order: repair for repair in repairs}
    dropped = {order for repair in repairs for order in repair.absorbed_orders}
    kept = []
    for definition in entry["definitions"]:
        order = definition.get("order")
        if definition.get("source") == "bdb" and (order in dropped or order in by_order and by_order[order].after is None):
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


def spanish_drift(lexicon: dict[str, dict], spanish: dict[str, str]) -> list[Repair]:
    return [
        Repair(strong, d["order"], d["text_en"], d["text_en"], ())
        for strong, entry in sorted(lexicon.items())
        for d in entry.get("definitions", [])
        if d.get("source") == "bdb" and d.get("text_en") in spanish and d.get("text_es") != spanish[d["text_en"]]
    ]


def lexicon_repairs() -> tuple[dict[str, dict], list[Repair]]:
    from .utils import load_bdb_xml

    lexicon = {}
    for name in LEXICON_FILES:
        lexicon.update(read_json(config.LEXICON_DIR / name))
    repairs = derive(lexicon, load_bdb_xml(), strong_to_bdb())
    repaired = {(repair.strong, repair.order) for repair in repairs}
    drift = [repair for repair in spanish_drift(lexicon, read_json(SPANISH_FILE)) if (repair.strong, repair.order) not in repaired]
    return lexicon, repairs + drift


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    for flag in ("--check", "--write"):
        mode.add_argument(flag, action="store_true")
    args = parser.parse_args(argv)

    spanish = read_json(SPANISH_FILE)
    _, repairs = lexicon_repairs()
    missing = sorted({repair.after for repair in repairs if repair.after} - set(spanish))
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
