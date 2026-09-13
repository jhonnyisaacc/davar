"""Parse UBS Greek NT dictionary JSON and match lemma plus sense evidence."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

_PUNCT = re.compile(r"[^\w\s]+", re.UNICODE)


def nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value.strip())


def fold_lemma(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", nfc(value).lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def tokens(value: str) -> frozenset[str]:
    cleaned = _PUNCT.sub(" ", nfc(value).lower())
    return frozenset(part for part in cleaned.split() if len(part) > 1)


@dataclass(frozen=True)
class UbsSense:
    lex_id: str
    entry_code: str
    lemma: str
    strongs: tuple[str, ...]
    glosses: tuple[str, ...]
    definition_short: str
    definition_long: str
    domain: str


def _senses_from_entry(entry: dict[str, Any]) -> list[UbsSense]:
    lemma = str(entry.get("Lemma") or "")
    strongs = tuple(str(code) for code in entry.get("StrongCodes") or [])
    found: list[UbsSense] = []
    for base in entry.get("BaseForms") or []:
        for meaning in base.get("LEXMeanings") or []:
            domains = meaning.get("LEXDomains") or []
            domain = str(domains[0].get("Domain") or "") if domains else ""
            for sense in meaning.get("LEXSenses") or []:
                if str(sense.get("LanguageCode") or "") not in {"es", "spa", "spanish"}:
                    continue
                found.append(
                    UbsSense(
                        lex_id=str(meaning.get("LEXID") or ""),
                        entry_code=str(meaning.get("LEXEntryCode") or ""),
                        lemma=lemma,
                        strongs=strongs,
                        glosses=tuple(str(item) for item in sense.get("Glosses") or []),
                        definition_short=str(sense.get("DefinitionShort") or ""),
                        definition_long=str(sense.get("DefinitionLong") or ""),
                        domain=domain,
                    )
                )
    return found


def parse_ubs_file(text: str) -> list[UbsSense]:
    payload = json.loads(text)
    if not isinstance(payload, list):
        raise ValueError("UBS Greek dictionary JSON must be a list of entries")
    senses: list[UbsSense] = []
    for entry in payload:
        if isinstance(entry, dict):
            senses.extend(_senses_from_entry(entry))
    return senses


def index_senses(senses: list[UbsSense]) -> dict[str, list[UbsSense]]:
    index: dict[str, list[UbsSense]] = {}
    for sense in senses:
        for key in {nfc(sense.lemma), fold_lemma(sense.lemma)}:
            bucket = index.setdefault(key, [])
            if sense not in bucket:
                bucket.append(sense)
    return index


def senses_for_lemma(
    senses: list[UbsSense],
    lemma: str,
    index: dict[str, list[UbsSense]] | None = None,
) -> list[UbsSense]:
    folded = fold_lemma(lemma)
    exact = nfc(lemma)
    if index is not None:
        found = []
        for key in {exact, folded}:
            for sense in index.get(key, []):
                if sense not in found:
                    found.append(sense)
        return found
    return [
        sense
        for sense in senses
        if nfc(sense.lemma) == exact or fold_lemma(sense.lemma) == folded
    ]


def sense_evidence(english_short: str, english_fuller: str, ubs: UbsSense) -> dict | None:
    """Require sense text, not Strong’s number, before accepting a UBS row."""
    english = tokens(english_short) | tokens(english_fuller)
    spanish = tokens(" ".join(ubs.glosses)) | tokens(ubs.definition_short)
    overlap = sorted(english & spanish)
    if overlap:
        return {
            "kind": "shared_content_words",
            "lex_id": ubs.lex_id,
            "overlap": overlap,
        }
    return None
