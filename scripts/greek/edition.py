"""Select the SBLGNT reading from official TAGNT edition markers.

TAGNT is an amalgamated corpus. The Word-Type field (N/K/O) classifies
Ancient / Traditional / Other witnesses. SBLGNT is not N or K; it is
listed as SBL in the Editions field (Holmes 2010).

Do not treat NKO as “include this token in SBLGNT”.
Do not concatenate tokens that lack the SBL edition token.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Official TAGNT Editions abbreviation: "SBL= Holmes 2010".
SBL_EDITION_TOKEN = "SBL"
READING_EDITION = "sblgnt"
TAGGING_SOURCE = "stepbible-tagnt"

# Displacement notes such as WH»1 or Byz«14.24 are not separate editions.
_DISPLACEMENT = re.compile(r"[»«].*$")
_TOKEN_SPLIT = re.compile(r"[+;]")
_WORD_REF = re.compile(
    r"^(?P<book>[1-3]?[A-Za-z]{2,3})\.(?P<chapter>\S+?)\.(?P<verse>\S+)#"
    r"(?P<index>\d+)=(?P<word_type>\S+)$"
)


@dataclass(frozen=True)
class TagntWordRef:
    book: str
    chapter: str
    verse: str
    index: str
    word_type: str
    display_verse: str


def edition_tokens(editions: str) -> frozenset[str]:
    """Parse the TAGNT Editions field into edition identifiers."""
    tokens: set[str] = set()
    for raw in _TOKEN_SPLIT.split(editions):
        token = _DISPLACEMENT.sub("", raw).strip()
        if token:
            tokens.add(token)
    return frozenset(tokens)


def includes_sbl(editions: str) -> bool:
    """True when TAGNT marks this token as present in SBLGNT."""
    return SBL_EDITION_TOKEN in edition_tokens(editions)


def parse_word_ref(ref_field: str) -> TagntWordRef:
    """Parse `Mat.1.1#01=NKO` or `Rom.16.25{14.24}#01=NKO`."""
    match = _WORD_REF.match(ref_field.strip())
    if not match:
        raise ValueError(f"Invalid TAGNT Word & Type field: {ref_field}")
    return TagntWordRef(
        book=match.group("book"),
        chapter=match.group("chapter"),
        verse=match.group("verse"),
        index=match.group("index"),
        word_type=match.group("word_type"),
        display_verse=(
            f"{match.group('book')}.{match.group('chapter')}.{match.group('verse')}"
        ),
    )


def select_sblgnt_tokens(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Keep only tokens whose Editions field includes SBL, in file order.

    Alternative readings without SBL are dropped, never concatenated.
    """
    selected: list[dict[str, str]] = []
    for row in rows:
        if includes_sbl(row["editions"]):
            selected.append(row)
    return selected


def verses_without_sbl(rows: list[dict[str, str]]) -> list[str]:
    """Verse identities that have TAGNT rows but no SBL token."""
    by_verse: dict[str, bool] = {}
    for row in rows:
        try:
            ref = parse_word_ref(row["ref"])
        except ValueError:
            continue
        key = ref.display_verse
        by_verse[key] = by_verse.get(key, False) or includes_sbl(row["editions"])
    return [verse for verse, has_sbl in by_verse.items() if not has_sbl]
