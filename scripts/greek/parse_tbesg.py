"""Parse official TBESG rows into English short and fuller definitions."""

from __future__ import annotations

import html
import re
from collections import defaultdict
from dataclasses import dataclass

from scripts.greek.parse_tagnt import strong_family, strong_lookup, strong_suffix
from scripts.greek.text_clean import clean_lexical_text

_ENTRY = re.compile(r"^G\d+")
_BR = re.compile(r"<br\s*/?>", re.I)
_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"[ \t]+")


@dataclass(frozen=True)
class TbesgEntry:
    estrong: str
    dstrong: str
    related: str
    lemma: str
    translit_en: str
    morph: str
    short: str
    fuller_html: str
    fuller: str


def html_to_text(value: str) -> str:
    """Strip TBESG markup for the fuller-definition field; keep it distinct from the gloss."""
    text = _BR.sub("\n", value)
    text = _TAG.sub("", text)
    text = html.unescape(text)
    lines = [_SPACE.sub(" ", line).strip() for line in text.splitlines()]
    return clean_lexical_text("\n".join(line for line in lines if line))


def parse_dstrong_cell(cell: str) -> str:
    return cell.split("=", 1)[0].strip()


def parse_tbesg_line(line: str) -> TbesgEntry | None:
    if not _ENTRY.match(line) or "\t" not in line:
        return None
    cols = line.split("\t")
    if len(cols) < 8:
        return None
    dstrong = parse_dstrong_cell(cols[1])
    if not dstrong.startswith("G"):
        return None
    fuller_html = cols[7].strip()
    return TbesgEntry(
        estrong=cols[0].strip(),
        dstrong=dstrong,
        related=cols[2].strip(),
        lemma=cols[3].strip(),
        translit_en=cols[4].strip(),
        morph=cols[5].strip(),
        short=clean_lexical_text(cols[6].strip()),
        fuller_html=fuller_html,
        fuller=html_to_text(fuller_html),
    )


def parse_tbesg_file(text: str) -> list[TbesgEntry]:
    entries: list[TbesgEntry] = []
    for line in text.splitlines():
        entry = parse_tbesg_line(line)
        if entry is not None:
            entries.append(entry)
    return entries


def entries_by_dstrong(entries: list[TbesgEntry]) -> dict[str, TbesgEntry]:
    return {entry.dstrong: entry for entry in entries}


def index_tbesg(
    entries: list[TbesgEntry],
) -> dict[str, dict[str, list[TbesgEntry]]]:
    exact: dict[str, list[TbesgEntry]] = defaultdict(list)
    family: dict[str, list[TbesgEntry]] = defaultdict(list)
    estrong: dict[str, list[TbesgEntry]] = defaultdict(list)
    for entry in entries:
        for key in {entry.dstrong, strong_lookup(entry.dstrong)}:
            if entry not in exact[key]:
                exact[key].append(entry)
        family[strong_family(entry.dstrong)].append(entry)
        for key in {entry.estrong, strong_lookup(entry.estrong), strong_family(entry.estrong)}:
            if entry not in estrong[key]:
                estrong[key].append(entry)
    return {"estrong": estrong, "exact": exact, "family": family}


def resolve_tbesg_entries(
    displayed: str,
    entries: list[TbesgEntry],
    index: dict[str, dict[str, list[TbesgEntry]]] | None = None,
) -> list[TbesgEntry]:
    """Map a displayed TAGNT dStrong onto official TBESG rows.

    TAGNT sometimes stores the unsuffixed stem where TBESG only has G/H
    senses, and the reverse for a few verbs (G3700G → G3700). Preserve the
    displayed identifier; only the lookup is aliased.
    """
    catalog = index or index_tbesg(entries)
    for key in (displayed, strong_lookup(displayed)):
        found = catalog["exact"].get(key)
        if found:
            return list(found)

    family_entries = catalog["family"].get(strong_family(displayed), [])
    suffix = strong_suffix(displayed)
    if family_entries:
        if suffix:
            same_suffix = [
                item for item in family_entries if strong_suffix(item.dstrong) == suffix
            ]
            if same_suffix:
                return same_suffix
            unsuffixed = [
                item for item in family_entries if not strong_suffix(item.dstrong)
            ]
            return unsuffixed or list(family_entries)
        unsuffixed = [item for item in family_entries if not strong_suffix(item.dstrong)]
        return unsuffixed or list(family_entries)

    for key in (displayed, strong_lookup(displayed), strong_family(displayed)):
        found = catalog["estrong"].get(key)
        if found:
            return list(found)
    return []
