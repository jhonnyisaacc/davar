"""Strip TAGNT/TBESG/UBS editorial markup from displayed Greek text."""

from __future__ import annotations

import re

_SURFACE_MARKS = re.compile(r"[¶§]")
_L_REF = re.compile(r"\{L:([^<{]+)(?:<[^>]*>)?\}(?:\[[a-z]\])?", re.I)
_BRACE_REF = re.compile(r"\{[DNS]:[^}]+\}")
_SDBG = re.compile(r"<SDBG:[^>]+>", re.I)
_UNDERSCORE_HEADING = re.compile(r"_{1,2}(?=(?:[IVXLC]+\.|\d+\.|\([a-z]\)))")
_BARE_UNDERSCORES = re.compile(r"_{2,}")
_SPACE = re.compile(r"[ \t]+")


def clean_greek_surface_text(value: str) -> str:
    """Remove TAGNT paragraph marks from a displayed SBL token or verse."""
    text = _SURFACE_MARKS.sub("", value)
    return _SPACE.sub(" ", text).strip()


def clean_lexical_text(value: str) -> str:
    """Remove Louw-Nida/SDBG refs and Abbott-Smith section underscores."""
    text = _L_REF.sub(r"\1", value)
    text = _BRACE_REF.sub("", text)
    text = _SDBG.sub("", text)
    text = _UNDERSCORE_HEADING.sub("", text)
    text = _BARE_UNDERSCORES.sub("", text)
    lines = [_SPACE.sub(" ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)
