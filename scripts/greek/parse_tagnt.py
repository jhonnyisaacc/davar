"""Parse official TAGNT rows and apply the documented SBLGNT spelling rules."""

from __future__ import annotations

import re
from dataclasses import dataclass

from scripts.greek.books import TAGNT_TO_DAVAR, davar_book_id
from scripts.greek.edition import (
    SBL_EDITION_TOKEN,
    edition_tokens,
    includes_sbl,
    parse_word_ref,
)

COL_REF = 0
COL_GREEK = 1
COL_DSTRONG = 3
COL_LEMMA = 4
COL_EDITIONS = 5
COL_SPELLING = 7

_GREEK_CELL = re.compile(r"^(?P<text>\S+(?:\s+\S+)*)\s+\((?P<translit>[^)]*)\)\s*$")
_STRONG = re.compile(r"^(G\d+[A-Za-z]?)$")


@dataclass(frozen=True)
class TagntToken:
    ref: str
    book: str
    davar_book: str
    chapter: int
    verse_id: str
    verse_number: int | None
    index: int
    word_type: str
    text: str
    translit_en: str
    strong: str
    strong_lookup: str
    morph: str
    lemma: str
    lemma_gloss: str
    editions: str


def extract_greek_and_translit(cell: str) -> tuple[str, str]:
    """Split `Βίβλος (Biblos)` while keeping attached punctuation on the Greek."""
    cleaned = cell.strip().lstrip("[")
    match = _GREEK_CELL.match(cleaned)
    if match:
        return match.group("text"), match.group("translit")
    return cleaned, ""


def spelling_for_sbl(main_cell: str, variants: str) -> str:
    """Use the SBL spelling variant when TAGNT names one; otherwise the main cell."""
    default_text, _ = extract_greek_and_translit(main_cell)
    if not variants.strip():
        return default_text
    for part in variants.split(";"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        editions, form = part.split(":", 1)
        if SBL_EDITION_TOKEN in edition_tokens(editions):
            return form.strip() or default_text
    return default_text


def parse_dstrong(cell: str) -> tuple[str, str]:
    if "=" in cell:
        strong, morph = cell.split("=", 1)
        return strong.strip(), morph.strip()
    return cell.strip(), ""


def parse_lemma_gloss(cell: str) -> tuple[str, str]:
    if "=" not in cell:
        return cell.strip(), ""
    lemma, gloss = cell.split("=", 1)
    return lemma.strip(), gloss.strip()


def strong_lookup(strong: str) -> str:
    """Normalize only the lookup key; preserve the displayed dStrong separately."""
    compact = strong.replace(" ", "")
    if compact.startswith("G"):
        letters = compact[1:]
        digits = "".join(ch for ch in letters if ch.isdigit())
        suffix = "".join(ch for ch in letters if ch.isalpha())
        if digits:
            return f"G{int(digits):04d}{suffix}"
    return compact


def verse_number(verse_id: str) -> int | None:
    digits = verse_id.split("{", 1)[0]
    return int(digits) if digits.isdigit() else None


def parse_tagnt_line(line: str) -> TagntToken | None:
    if "\t" not in line or "=" not in line or "#" not in line:
        return None
    cols = line.split("\t")
    if len(cols) <= COL_EDITIONS:
        return None
    ref_field = cols[COL_REF]
    try:
        parsed = parse_word_ref(ref_field)
    except ValueError:
        return None
    if parsed.book not in TAGNT_TO_DAVAR:
        return None
    editions = cols[COL_EDITIONS]
    if not includes_sbl(editions):
        return None
    spelling = cols[COL_SPELLING] if len(cols) > COL_SPELLING else ""
    text = spelling_for_sbl(cols[COL_GREEK], spelling)
    _, translit = extract_greek_and_translit(cols[COL_GREEK])
    strong, morph = parse_dstrong(cols[COL_DSTRONG] if len(cols) > COL_DSTRONG else "")
    lemma, lemma_gloss = parse_lemma_gloss(
        cols[COL_LEMMA] if len(cols) > COL_LEMMA else ""
    )
    return TagntToken(
        ref=ref_field,
        book=parsed.book,
        davar_book=davar_book_id(parsed.book),
        chapter=int(parsed.chapter) if parsed.chapter.isdigit() else 0,
        verse_id=parsed.verse,
        verse_number=verse_number(parsed.verse),
        index=int(parsed.index) if parsed.index.isdigit() else 0,
        word_type=parsed.word_type,
        text=text,
        translit_en=translit,
        strong=strong,
        strong_lookup=strong_lookup(strong),
        morph=morph,
        lemma=lemma,
        lemma_gloss=lemma_gloss,
        editions=editions,
    )


def parse_tagnt_file(text: str) -> list[TagntToken]:
    tokens: list[TagntToken] = []
    for line in text.splitlines():
        token = parse_tagnt_line(line)
        if token is not None:
            tokens.append(token)
    return tokens


def assert_greek_strong(strong: str) -> None:
    if strong and not _STRONG.match(strong.split("|")[0].split("«")[0]):
        raise ValueError(f"Non-Greek Strong identifier: {strong}")
