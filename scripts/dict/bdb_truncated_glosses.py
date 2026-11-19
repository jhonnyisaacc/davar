"""Complete the BDB glosses that the lexicon stored cut off, such as "be" for "be or act as adversary", and drop cut-off glosses stored under the wrong entry.

The extractor's output on the real BDB XML decides each repair, so a rebuild of the lexicon gives the same completed glosses; --check also fails when they disagree.

    python -m scripts.dict.bdb_truncated_glosses --check
    python -m scripts.dict.bdb_truncated_glosses --write
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from .build_lexicon import (
    DIVINE_NAME,
    DIVINE_NAME_ABBREVIATION,
    INCOMPLETE_GLOSS_ENDINGS,
    NS,
    def_gloss_parts,
    extract_bdb_definitions_with_sense,
    load_lexical_index,
)
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
    by_gloss: dict[str, list[Completion]] = {}
    tag = f"{{{NS['bdb']}}}"
    for entry in bdb_root.iter(f"{tag}entry"):
        for parent in [entry, *entry.iter(f"{tag}sense")]:
            for part in def_gloss_parts(parent):
                if len(part.stages) > 1:
                    completion = Completion(part.text, tuple(part.defs), tuple(part.stages))
                    if completion not in by_gloss.setdefault(part.text, []):
                        by_gloss[part.text].append(completion)
    return by_gloss


def stored_form(text: str) -> str:
    return text.strip().replace(DIVINE_NAME_ABBREVIATION, DIVINE_NAME)


def is_truncated(text: str) -> bool:
    words = text.lower().split()
    return bool(words) and words[-1] in INCOMPLETE_GLOSS_ENDINGS and words != [words[-1]] or len(words) == 1 and words[0] in INCOMPLETE_GLOSS_ENDINGS - LONE_PREPOSITIONS


def is_kept(text: str) -> bool:
    return len(text.strip()) > 1 and text.strip().lower() not in LONE_PREPOSITIONS


def bdb_glosses(entry: dict) -> list[dict]:
    return sorted((d for d in entry.get("definitions", []) if d.get("source") == "bdb"), key=lambda d: d.get("order", 0))


def stored_shapes(completions: list[Completion]) -> list[list[str]]:
    shapes = []
    for completion in completions:
        for stage, consumed in completion.stages[:-1]:
            rest = [stored_form(text) for text in completion.defs[consumed:] if is_kept(text)]
            shapes.extend(shape for shape in ([stored_form(stage), *rest] if is_kept(stage) else [], rest) if shape and shape not in shapes)
    return shapes


def repairs_for(strong: str, entry: dict, extracted: list[str], completions: dict[str, list[Completion]], stages: set[str]) -> list[Repair]:
    definitions = bdb_glosses(entry)
    texts = [stored_form(d.get("text_en") or "") for d in definitions]
    raw = [(d.get("text_en") or "").strip() for d in definitions]
    repairs: dict[int, Repair] = {}
    cursor = 0
    for gloss in extracted:
        present = next((index for index in range(cursor, len(texts)) if texts[index] == stored_form(gloss)), len(texts))
        hits = [
            (index, shape)
            for shape in stored_shapes(completions.get(gloss, []))
            for index in range(cursor, present)
            if texts[index] == shape[0]
        ]
        if not hits:
            cursor = present + 1 if present < len(texts) else cursor
            continue
        index, shape = min(hits, key=lambda hit: (hit[0], -len(hit[1])))
        taken = 0
        while taken < len(shape) - 1 and index + 1 + taken < len(texts) and texts[index + 1 + taken] == shape[1 + taken]:
            taken += 1
        absorbed = tuple(definitions[index + 1 + offset]["order"] for offset in range(taken))
        repairs[definitions[index]["order"]] = Repair(strong, definitions[index]["order"], raw[index], gloss, absorbed)
        cursor = index + 1 + taken
    absorbed = {order for repair in repairs.values() for order in repair.absorbed_orders}
    shown = {stored_form(gloss) for gloss in extracted}
    for index, text in enumerate(texts):
        order = definitions[index]["order"]
        if order not in repairs and order not in absorbed and text in stages and text not in shown and is_truncated(text):
            repairs[order] = Repair(strong, order, raw[index], None, ())
    return sorted(repairs.values(), key=lambda repair: repair.order)


def touched(entry: dict, glosses: set[str]) -> bool:
    return any(stored_form(d.get("text_en") or "") in glosses for d in bdb_glosses(entry))


def glosses_in_completions(completions: dict[str, list[Completion]]) -> tuple[set[str], set[str]]:
    found = [completion for group in completions.values() for completion in group]
    stages = {stored_form(stage) for completion in found for stage, _ in completion.stages[:-1]}
    pieces = {stored_form(text) for completion in found for text in completion.defs}
    return stages, stages | pieces | set(completions)


def derive(lexicon: dict[str, dict], bdb_root: ET.Element, extract: Callable[[str, dict], list[str]]) -> list[Repair]:
    completions = bdb_completions(bdb_root)
    stages, related = glosses_in_completions(completions)
    repairs = []
    for strong, entry in sorted(lexicon.items()):
        if touched(entry, related):
            repairs.extend(repairs_for(strong, entry, extract(strong, entry), completions, stages))
    return repairs


def disagreements(lexicon: dict[str, dict], bdb_root: ET.Element, extract: Callable[[str, dict], list[str]]) -> dict[str, tuple[list[str], list[str]]]:
    completions = bdb_completions(bdb_root)
    _, related = glosses_in_completions(completions)
    found = {}
    for strong, entry in sorted(lexicon.items()):
        if touched(entry, related):
            stored = [text for text in (stored_form(d.get("text_en") or "") for d in bdb_glosses(entry)) if text in completions]
            extracted = [text for text in map(stored_form, extract(strong, entry)) if text in completions]
            remaining = iter(extracted)
            if not all(text in remaining for text in stored):
                found[strong] = (stored, extracted)
    return found


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


def extractor(bdb_root: ET.Element, lexical_index: dict) -> Callable[[str, dict], list[str]]:
    @cache
    def extract(strong: str, lemma: str) -> list[str]:
        return [d["text_en"] for d in extract_bdb_definitions_with_sense(strong, lemma, bdb_root, lexical_index)]

    return lambda strong, entry: extract(strong, entry.get("lemma") or "")


def spanish_drift(lexicon: dict[str, dict], spanish: dict[str, str]) -> list[Repair]:
    return [
        Repair(strong, d["order"], d["text_en"], d["text_en"], ())
        for strong, entry in sorted(lexicon.items())
        for d in entry.get("definitions", [])
        if d.get("source") == "bdb" and d.get("text_en") in spanish and d.get("text_es") != spanish[d["text_en"]]
    ]


def lexicon_repairs() -> tuple[list[Repair], dict[str, tuple[list[str], list[str]]]]:
    from .utils import load_bdb_xml

    lexicon = {}
    for name in LEXICON_FILES:
        lexicon.update(read_json(config.LEXICON_DIR / name))
    bdb_root = load_bdb_xml()
    extract = extractor(bdb_root, load_lexical_index())
    repairs = derive(lexicon, bdb_root, extract)
    repaired = {(repair.strong, repair.order) for repair in repairs}
    drift = [repair for repair in spanish_drift(lexicon, read_json(SPANISH_FILE)) if (repair.strong, repair.order) not in repaired]
    return repairs + drift, disagreements(lexicon, bdb_root, extract)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    for flag in ("--check", "--write"):
        mode.add_argument(flag, action="store_true")
    args = parser.parse_args(argv)

    spanish = read_json(SPANISH_FILE)
    repairs, disagreeing = lexicon_repairs()
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
        repairs, disagreeing = lexicon_repairs()
    for strong, (stored, extracted) in disagreeing.items():
        print(f"{strong}\tlexicon {stored!r} != extractor {extracted!r}")
    print(f"{len(repairs)} truncated BDB glosses left in the lexicon; {len(disagreeing)} entries whose completed glosses differ from the extractor's")
    return 1 if repairs or disagreeing else 0


if __name__ == "__main__":
    sys.exit(main())
