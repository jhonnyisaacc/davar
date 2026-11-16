"""Undo the Spanish gloss shift that the 2026-02-04 Grok run wrote into words.json.

    python -m scripts.dict.spanish_realignment --check
    python -m scripts.dict.spanish_realignment --write
    python -m scripts.dict.spanish_realignment --explain 9
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import unicodedata
from dataclasses import dataclass

from .config import config

RUN_COMMIT = "e70dacf53"
REFERENCE_COMMIT = "2d57796e2"
BATCH_SIZE = 500
WORDS_FILE = "data/dict/lexicon/words.json"


@dataclass(frozen=True)
class Fault:
    batch: int
    start: int
    offset: int


FAULTS = (
    Fault(batch=2, start=150, offset=-1),
    Fault(batch=9, start=195, offset=1),
    Fault(batch=11, start=271, offset=1),
    Fault(batch=12, start=449, offset=1),
    Fault(batch=15, start=254, offset=1),
    Fault(batch=16, start=454, offset=1),
    Fault(batch=17, start=474, offset=1),
    Fault(batch=19, start=418, offset=1),
    Fault(batch=19, start=419, offset=2),
    Fault(batch=21, start=307, offset=1),
    Fault(batch=24, start=490, offset=1),
)


@dataclass(frozen=True)
class RunGloss:
    strong: str
    index: int
    order: int
    text_en: str
    text_es: str


@dataclass(frozen=True)
class Correction:
    strong: str
    index: int
    order: int
    text_en: str
    shifted: str
    corrected: str
    source: str


def git_json(commit: str, path: str) -> dict:
    result = subprocess.run(
        ["git", "-C", str(config.PROJECT_ROOT), "show", f"{commit}:{path}"],
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", (text or "").strip().lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def run_sequence(words: dict) -> list[RunGloss]:
    return [
        RunGloss(
            strong=strong,
            index=index,
            order=definition.get("order"),
            text_en=definition.get("text_en") or definition.get("text") or "",
            text_es=definition.get("text_es") or "",
        )
        for strong, entry in words.items()
        for index, definition in sorted(
            enumerate(entry["definitions"]), key=lambda item: item[1].get("order", 999)
        )
    ]


@dataclass(frozen=True)
class ShiftRun:
    offset: int
    glosses: tuple[RunGloss, ...]


def shifted_runs(entries: dict, min_run: int = 3) -> list[ShiftRun]:
    sequence = run_sequence(entries)
    consensus: dict[str, dict[str, int]] = {}
    for gloss in sequence:
        if gloss.text_en and gloss.text_es:
            counts = consensus.setdefault(fold(gloss.text_en), {})
            counts[fold(gloss.text_es)] = counts.get(fold(gloss.text_es), 0) + 1

    def attested(position: int, source: int) -> bool | None:
        counts = consensus.get(fold(sequence[source].text_en))
        if not counts:
            return None
        own = 1 if position == source else 0
        return counts.get(fold(sequence[position].text_es), 0) - own > 0

    def displaced(position: int, offset: int) -> bool:
        neighbour = position + offset
        return (
            0 <= neighbour < len(sequence)
            and fold(sequence[position].text_en) != fold(sequence[neighbour].text_en)
            and attested(position, position) is False
            and attested(position, neighbour) is True
        )

    runs = []
    for offset in (1, -1):
        position = 0
        while position < len(sequence):
            end = position
            while end < len(sequence) and displaced(end, offset):
                end += 1
            if end - position >= min_run:
                runs.append(ShiftRun(offset, tuple(sequence[position:end])))
            position = max(end, position + 1)
    return runs


def reference_glosses(words: dict) -> dict[tuple[str, str], set[str]]:
    glosses: dict[tuple[str, str], set[str]] = {}
    for strong, entry in words.items():
        for definition in entry["definitions"]:
            text_en = definition.get("text_en") or definition.get("text")
            text_es = definition.get("text_es")
            if text_en and text_es:
                glosses.setdefault((strong, fold(text_en)), set()).add(text_es.strip())
    return glosses


def batch_corrections(
    faults: list[Fault],
    glosses: list[RunGloss],
    reference: dict[tuple[str, str], set[str]],
) -> list[Correction]:
    if not faults:
        return []
    size = len(glosses)
    offsets = [0] * size
    for fault in sorted(faults, key=lambda fault: fault.start):
        offsets[fault.start:] = [fault.offset] * (size - fault.start)
    retranslated_tail = max(0, max(offsets))
    affected = range(
        min(fault.start + min(fault.offset, 0) for fault in faults),
        size - retranslated_tail,
    )
    realigned: dict[int, str] = {}
    for position in range(min(fault.start for fault in faults), size - retranslated_tail):
        target = position + offsets[position]
        if target != position and target in affected:
            realigned[target] = glosses[position].text_es

    corrections = []
    for position in affected:
        gloss = glosses[position]
        if position in realigned:
            corrected, source = realigned[position], "realigned"
        else:
            candidates = reference.get((gloss.strong, fold(gloss.text_en)), set())
            if len(candidates) != 1:
                continue
            corrected, source = next(iter(candidates)), "reference"
        if corrected != gloss.text_es:
            corrections.append(
                Correction(gloss.strong, gloss.index, gloss.order, gloss.text_en, gloss.text_es, corrected, source)
            )
    return corrections


@dataclass(frozen=True)
class Realignment:
    corrections: list[Correction]
    shifted: dict[tuple[str, str], set[str]]
    by_order: dict[tuple[str, str, int], str]
    by_shifted: dict[tuple[str, str, str], str]


def derive_realignment() -> Realignment:
    sequence = run_sequence(git_json(RUN_COMMIT, WORDS_FILE))
    reference = reference_glosses(git_json(REFERENCE_COMMIT, WORDS_FILE))
    corrections = []
    for start in range(0, len(sequence), BATCH_SIZE):
        batch = start // BATCH_SIZE + 1
        faults = [fault for fault in FAULTS if fault.batch == batch]
        corrections.extend(batch_corrections(faults, sequence[start:start + BATCH_SIZE], reference))

    shifted: dict[tuple[str, str], set[str]] = {}
    by_shifted: dict[tuple[str, str, str], set[str]] = {}
    for correction in corrections:
        shifted.setdefault((correction.strong, correction.text_en), set()).add(correction.shifted)
        by_shifted.setdefault((correction.strong, correction.text_en, correction.shifted), set()).add(correction.corrected)
    corrected = {(c.strong, c.index): c.corrected for c in corrections}
    by_order = {
        (gloss.strong, gloss.text_en, gloss.order): corrected.get((gloss.strong, gloss.index), gloss.text_es)
        for gloss in sequence
        if (gloss.strong, gloss.text_en) in shifted
    }
    return Realignment(
        corrections=corrections,
        shifted=shifted,
        by_order=by_order,
        by_shifted={key: next(iter(values)) for key, values in by_shifted.items() if len(values) == 1},
    )


def target_gloss(realignment: Realignment, strong: str, definition: dict) -> str | None:
    text_en = definition.get("text_en") or definition.get("text") or ""
    text_es = definition.get("text_es")
    if text_es not in realignment.shifted.get((strong, text_en), ()):
        return None
    target = realignment.by_order.get((strong, text_en, definition.get("order")))
    if target is None:
        target = realignment.by_shifted.get((strong, text_en, text_es))
    return target if target and target != text_es else None


def pending_rows(entries: dict, realignment: Realignment) -> list[tuple[dict, str]]:
    rows = []
    for strong, entry in entries.items():
        for definition in entry.get("definitions", []):
            target = target_gloss(realignment, strong, definition)
            if target is not None:
                rows.append((definition, target))
    return rows


def read_json(path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, data: dict, trailing_newline: bool) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(text + ("\n" if trailing_newline else ""), encoding="utf-8")


def apply_realignment(realignment: Realignment) -> dict[str, int]:
    words_path = config.LEXICON_DIR / "words.json"
    words = read_json(words_path)
    word_rows = pending_rows(words, realignment)
    for row, target in word_rows:
        row["text_es"] = target
    write_json(words_path, words, trailing_newline=True)

    shard_rows = 0
    for strong in sorted({strong for strong, _ in realignment.shifted}):
        shard_path = config.LEXICON_WORDS_DIR / f"{strong}.json"
        if not shard_path.exists():
            continue
        shard = read_json(shard_path)
        rows = pending_rows({strong: shard}, realignment)
        for row, target in rows:
            row["text_es"] = target
        if rows:
            shard_rows += len(rows)
            write_json(shard_path, shard, trailing_newline=True)

    backup_path = config.LEXICON_DIR / "translations.json"
    backup = read_json(backup_path)
    backup_rows = 0
    for correction in realignment.corrections:
        stored = backup.get(f"{correction.strong}:{correction.index + 1}")
        if stored is not None and stored.get("es") == correction.shifted:
            stored["es"] = correction.corrected
            backup_rows += 1
    write_json(backup_path, backup, trailing_newline=False)
    return {"words.json": len(word_rows), "shards": shard_rows, "translations.json": backup_rows}


def explain(batch: int, window: int) -> None:
    sequence = run_sequence(git_json(RUN_COMMIT, WORDS_FILE))
    reference = reference_glosses(git_json(REFERENCE_COMMIT, WORDS_FILE))
    base = (batch - 1) * BATCH_SIZE
    glosses = sequence[base:base + BATCH_SIZE]

    def agrees(position: int, offset: int) -> str:
        target = position + offset
        if not 0 <= target < len(glosses):
            return " "
        known = reference.get((glosses[target].strong, fold(glosses[target].text_en)))
        if known is None:
            return "?"
        return "y" if glosses[position].text_es.strip() in known else "."

    starts = [fault.start for fault in FAULTS if fault.batch == batch] or [0]
    shown = sorted({
        position
        for start in starts
        for position in range(max(0, start - window), min(len(glosses), start + window))
    })
    print("pos  strong order  self -1 +1 +2  text_en -> text_es")
    for position in shown:
        gloss = glosses[position]
        print(
            f"{position:4} {gloss.strong:7} {gloss.order:3}    "
            f"{agrees(position, 0)}  {agrees(position, -1)}  {agrees(position, 1)}  {agrees(position, 2)}  "
            f"{gloss.text_en!r} -> {gloss.text_es!r}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--explain", type=int, metavar="BATCH")
    parser.add_argument("--window", type=int, default=6)
    args = parser.parse_args(argv)

    if args.explain:
        explain(args.explain, args.window)
        return 0

    realignment = derive_realignment()
    by_source: dict[str, int] = {}
    for correction in realignment.corrections:
        by_source[correction.source] = by_source.get(correction.source, 0) + 1
    print(f"{len(realignment.corrections)} shifted glosses in the {RUN_COMMIT} run snapshot: {by_source}")

    if args.write:
        print(f"rewritten rows: {apply_realignment(realignment)}")

    words = read_json(config.LEXICON_DIR / "words.json")
    pending = pending_rows(words, realignment)
    for row, target in pending:
        print(f"{row.get('order')}\t{row.get('text_en')}\t{row.get('text_es')} -> {target}")
    print(f"{len(pending)} shifted glosses left in words.json")

    runs = shifted_runs(words) + shifted_runs(read_json(config.LEXICON_DIR / "roots.json"))
    for run in runs:
        print(f"offset {run.offset:+d}: " + "; ".join(
            f"{gloss.strong}:{gloss.order} {gloss.text_en} -> {gloss.text_es}" for gloss in run.glosses
        ))
    print(f"{len(runs)} runs of Spanish glosses that match a neighbour's English instead of their own")
    return 1 if pending or runs else 0


if __name__ == "__main__":
    sys.exit(main())
