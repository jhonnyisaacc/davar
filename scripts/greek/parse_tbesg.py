"""Parse official TBESG rows into English short and fuller definitions."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

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
    return "\n".join(line for line in lines if line)


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
        short=cols[6].strip(),
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
