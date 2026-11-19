"""The first gloss the reader shows for a lexicon entry, as shared/lexiconAssets.ts and shared/definitionMeanings.ts compute it.

    python -m scripts.dict.reader_gloss H8138 D0708
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from typing import Any

from .config import config

CONTROLS = re.compile("​|‌|‍|‎|‏|[‪-‮]|[⁠-⁤]|[⁦-⁩]|﻿")
DETAIL_SOURCES = {"tcysite-greek-detail"}
TCY_SHORT_SOURCES = {"tcysite-greek-strong", "tcysite-eric"}
ACADEMIC_SHORT_SOURCES = {"stepbible-tbesg", "stepbible", "tbesg", "ubs", "ubs-open", "strong", "bdb"}
BDB_DOT_ABBREV = re.compile(
    r"\b(?:sq|oft|pf|impf|inf(?:abs|cstr)?|ptcp?|part|conj|pred|prep|pers|subj|obj|accus|gen|dat|cstr|abs|vb|adj|adv|cf|etc|conjug)\.",
    re.IGNORECASE | re.ASCII,
)
BDB_TECH_WORDS = re.compile(r"\b(?:copula|periphrastic|implicit\s+accus(?:ative)?)\b", re.IGNORECASE | re.ASCII)
STRONG_PATTERN = re.compile(r"^[HGD]\d+[A-Z]?$")


@dataclass(frozen=True)
class Gloss:
    text: str
    definition: dict[str, Any]


def strip_controls(text: str) -> str:
    return re.sub(r"[ \t]+\n", "\n", CONTROLS.sub("", text)).strip()


def is_bdb_technical_scrap(text: str) -> bool:
    text = strip_controls(text)
    if not text:
        return False
    abbreviations = len(BDB_DOT_ABBREV.findall(text))
    tech_word = bool(BDB_TECH_WORDS.search(text))
    hebrew = len(re.findall("[֐-׿]", text))
    latin = len(re.findall("[A-Za-z]", text))
    return (
        abbreviations >= 2
        or abbreviations >= 1 and (tech_word or hebrew > 0 or latin <= 24)
        or tech_word
        or hebrew >= 2 and 0 < latin <= 12
    )


def source_rank(source: str) -> int:
    source = source.strip().lower()
    if source == "custom":
        return 0
    if source in TCY_SHORT_SOURCES:
        return 1
    if source.startswith("tcysite-") and source not in DETAIL_SOURCES:
        return 2
    if source in ACADEMIC_SHORT_SOURCES:
        return 3
    return 4 if not source else 2


def merged_definitions(strong: str, words: dict, roots: dict, custom: dict) -> list[dict[str, Any]] | None:
    key = strong.strip().upper()
    dictionary = words.get(key) or roots.get(key)
    entry = custom.get(key)
    if not STRONG_PATTERN.match(key) or not (dictionary or entry):
        return None
    seen, merged = set(), []
    for definition in [*((entry or {}).get("definitions") or []), *((dictionary or {}).get("definitions") or [])]:
        identity = ":".join(str(definition.get(field) or "") for field in ("source", "text_en", "text_es", "text_he", "text")).lower()
        if identity not in seen:
            seen.add(identity)
            merged.append(definition)
    return merged


def first_gloss(definitions: list[dict[str, Any]], language: str) -> Gloss | None:
    items = []
    for definition in definitions:
        english = definition.get("text_en")
        raw = definition.get("text_es") if language == "es" else english if english is not None else definition.get("text")
        text = strip_controls(raw or "")
        if text and not is_bdb_technical_scrap(text):
            items.append((text, (definition.get("source") or "strong"), definition))
    rest = [item for item in items if item[1].strip().lower() not in DETAIL_SOURCES and (item[2].get("definition_kind") or "").strip().lower() != "lexical_detail"]
    study = [item for item in items if item not in rest]
    customs = [item for item in rest if item[1].strip().lower() == "custom"]
    bdb = [item for item in rest if item[1].strip().lower() == "bdb"]
    others = [item for item in rest if item not in customs and item not in bdb]
    if customs:
        gloss = customs
    elif bdb:
        gloss = bdb[:1]
    else:
        gloss = sorted(others, key=lambda item: source_rank(item[1]))
    if not gloss and (bdb[1:] or study):
        gloss = sorted([*bdb[1:], *study], key=lambda item: len(item[0]))
    return Gloss(gloss[0][0], gloss[0][2]) if gloss else None


class Lexicon:
    def __init__(self, root=None):
        directory = root or config.LEXICON_DIR
        self.words = json.loads((directory / "words.json").read_text(encoding="utf-8"))
        self.roots = json.loads((directory / "roots.json").read_text(encoding="utf-8"))
        self.custom = json.loads((directory / "custom_definitions.json").read_text(encoding="utf-8"))
        self._cache: dict[str, tuple[Gloss | None, Gloss | None] | None] = {}

    def glosses(self, strong: str) -> tuple[Gloss | None, Gloss | None] | None:
        if strong not in self._cache:
            definitions = merged_definitions(strong, self.words, self.roots, self.custom)
            self._cache[strong] = None if definitions is None else (first_gloss(definitions, "en"), first_gloss(definitions, "es"))
        return self._cache[strong]


def main(argv: list[str]) -> int:
    lexicon = Lexicon()
    for strong in argv:
        result = lexicon.glosses(strong)
        en, es = result or (None, None)
        print(f"{strong}\t{en.text if en else ''}\t{es.text if es else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
