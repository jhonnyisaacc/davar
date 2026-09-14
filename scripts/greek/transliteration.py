"""Deterministic Greek transliteration for Greek Besorah artifacts."""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

RULE_VERSION = "greek-transliteration-v1"
Language = Literal["en", "es", "he"]

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXCEPTIONS_PATH = (
    ROOT / "tests" / "fixtures" / "greek" / "transliteration_exceptions_v1.json"
)

ROUGH_BREATHING = "\u0314"
DIAERESIS = "\u0308"
IOTA_SUBSCRIPT = "\u0345"


@dataclass(frozen=True)
class GreekUnit:
    base: str
    marks: frozenset[str]


LATIN_SINGLE = {
    "en": {
        "α": "a",
        "β": "b",
        "γ": "g",
        "δ": "d",
        "ε": "e",
        "ζ": "z",
        "η": "ē",
        "θ": "th",
        "ι": "i",
        "κ": "k",
        "λ": "l",
        "μ": "m",
        "ν": "n",
        "ξ": "x",
        "ο": "o",
        "π": "p",
        "ρ": "r",
        "σ": "s",
        "ς": "s",
        "τ": "t",
        "υ": "y",
        "φ": "ph",
        "χ": "ch",
        "ψ": "ps",
        "ω": "ō",
    },
    "es": {
        "α": "a",
        "β": "b",
        "γ": "g",
        "δ": "d",
        "ε": "e",
        "ζ": "z",
        "η": "e",
        "θ": "t",
        "ι": "i",
        "κ": "k",
        "λ": "l",
        "μ": "m",
        "ν": "n",
        "ξ": "x",
        "ο": "o",
        "π": "p",
        "ρ": "r",
        "σ": "s",
        "ς": "s",
        "τ": "t",
        "υ": "i",
        "φ": "f",
        "χ": "j",
        "ψ": "ps",
        "ω": "o",
    },
}

LATIN_DIGRAPHS = {
    "en": {
        "αι": "ai",
        "ει": "ei",
        "οι": "oi",
        "ου": "ou",
        "αυ": "au",
        "ευ": "eu",
        "ηυ": "ēu",
        "υι": "yi",
        "γγ": "ng",
        "γκ": "nk",
        "γξ": "nx",
        "γχ": "nch",
    },
    "es": {
        "αι": "ai",
        "ει": "ei",
        "οι": "oi",
        "ου": "u",
        "αυ": "au",
        "ευ": "eu",
        "ηυ": "eu",
        "υι": "ui",
        "γγ": "ng",
        "γκ": "nk",
        "γξ": "nx",
        "γχ": "nj",
    },
}

HEBREW_SINGLE = {
    "α": "א",
    "β": "ב",
    "γ": "ג",
    "δ": "ד",
    "ε": "א",
    "ζ": "ז",
    "η": "י",
    "θ": "ת",
    "ι": "י",
    "κ": "ק",
    "λ": "ל",
    "μ": "מ",
    "ν": "נ",
    "ξ": "קס",
    "ο": "ו",
    "π": "פ",
    "ρ": "ר",
    "σ": "ס",
    "ς": "ס",
    "τ": "ט",
    "υ": "י",
    "φ": "פ",
    "χ": "כ",
    "ψ": "פס",
    "ω": "ו",
}

HEBREW_DIGRAPHS = {
    "αι": "אי",
    "ει": "י",
    "οι": "וי",
    "ου": "ו",
    "αυ": "או",
    "ευ": "או",
    "ηυ": "יו",
    "υι": "וי",
    "γγ": "נג",
    "γκ": "נק",
    "γξ": "נקס",
    "γχ": "נכ",
}

FINAL_HEBREW = {"כ": "ך", "מ": "ם", "נ": "ן", "פ": "ף", "צ": "ץ"}


def _units(value: str) -> list[GreekUnit | str]:
    """Return lower-case Greek base letters with combining marks, preserving spaces."""
    result: list[GreekUnit | str] = []
    current_base = ""
    current_marks: set[str] = set()

    def flush() -> None:
        nonlocal current_base, current_marks
        if current_base:
            result.append(GreekUnit(current_base.lower(), frozenset(current_marks)))
            current_base = ""
            current_marks = set()

    for char in unicodedata.normalize("NFD", value):
        category = unicodedata.category(char)
        if category.startswith("M"):
            if current_base:
                current_marks.add(char)
            continue
        flush()
        if char.lower() in HEBREW_SINGLE:
            current_base = char
        elif char.isspace():
            result.append(" ")
    flush()
    return result


@lru_cache(maxsize=4)
def _load_exceptions(path: Path = DEFAULT_EXCEPTIONS_PATH) -> dict[str, dict[str, str]]:
    if not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != RULE_VERSION:
        raise ValueError(f"Transliteration exceptions must use {RULE_VERSION}")
    return payload.get("exceptions", {})


def _capitalize_like_greek(greek: str, result: str) -> str:
    first = next((char for char in greek if char.isalpha()), "")
    return result[:1].upper() + result[1:] if first.isupper() and result else result


def _finalize_hebrew(value: str) -> str:
    words = value.split()
    return " ".join(
        word[:-1] + FINAL_HEBREW.get(word[-1], word[-1]) if word else word
        for word in words
    )


def _transliterate_generated(greek: str, language: Language) -> str:
    units = _units(greek)
    output: list[str] = []
    index = 0
    while index < len(units):
        unit = units[index]
        if isinstance(unit, str):
            if output and output[-1] != " ":
                output.append(" ")
            index += 1
            continue

        next_unit = units[index + 1] if index + 1 < len(units) else None
        pair = (
            unit.base + next_unit.base
            if isinstance(next_unit, GreekUnit) and DIAERESIS not in next_unit.marks
            else ""
        )
        digraphs = HEBREW_DIGRAPHS if language == "he" else LATIN_DIGRAPHS[language]
        singles = HEBREW_SINGLE if language == "he" else LATIN_SINGLE[language]
        rough = ROUGH_BREATHING in unit.marks or (
            isinstance(next_unit, GreekUnit) and ROUGH_BREATHING in next_unit.marks
        )

        if pair in digraphs:
            rendered = digraphs[pair]
            consumed = (unit, next_unit)
            index += 2
        else:
            rendered = singles.get(unit.base, "")
            consumed = (unit,)
            index += 1

        if rough:
            rendered = ("ה" if language == "he" else "h") + rendered
        if any(IOTA_SUBSCRIPT in item.marks for item in consumed):
            rendered += "י" if language == "he" else "i"
        output.append(rendered)

    result = "".join(output).strip()
    if language == "he":
        return _finalize_hebrew(result)
    return _capitalize_like_greek(greek, result)


def transliterate(
    greek: str,
    language: Language,
    *,
    supplied_english: str | None = None,
    exceptions_path: Path = DEFAULT_EXCEPTIONS_PATH,
) -> str:
    """Transliterate a Greek form deterministically.

    English always prefers the STEPBible-supplied value. Exceptions are exact
    NFC Greek forms and are versioned with the rule set.
    """
    if language == "en" and supplied_english and supplied_english.strip():
        return supplied_english.strip()
    normalized = unicodedata.normalize("NFC", greek.strip())
    exception = _load_exceptions(exceptions_path).get(normalized, {})
    if language in exception:
        return exception[language]
    return _transliterate_generated(normalized, language)


def transliterations(
    greek: str,
    *,
    supplied_english: str | None = None,
    exceptions_path: Path = DEFAULT_EXCEPTIONS_PATH,
) -> dict[str, str]:
    return {
        language: transliterate(
            greek,
            language,
            supplied_english=supplied_english,
            exceptions_path=exceptions_path,
        )
        for language in ("en", "es", "he")
    }
