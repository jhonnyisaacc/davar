"""Automatable definition hygiene helpers (Phase 3).

Strip BiDi/control characters at import boundaries, and audit gloss length /
forbidden controls / fuller-in-primary mistakes without deleting licensed text.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

# Mirrors shared/definitionMeanings.ts UNICODE_CONTROLS
_UNICODE_CONTROLS = re.compile(
    "[\u200b\u200c\u200d\u200e\u200f"
    "\u202a-\u202e"
    "\u2060-\u2064"
    "\u2066-\u2069"
    "\ufeff]"
)

DETAIL_SOURCES = frozenset({"tcysite-greek-detail"})
DEFAULT_MAX_GLOSS_CHARS = 240


def strip_definition_controls(text: str) -> str:
    """Remove BiDi isolates, embedding marks, ZW*, and BOM from definition text."""
    cleaned = _UNICODE_CONTROLS.sub("", text or "")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    return cleaned.strip()


def has_forbidden_controls(text: str) -> bool:
    return bool(_UNICODE_CONTROLS.search(text or ""))


def is_detail_definition(definition: dict[str, Any]) -> bool:
    source = str(definition.get("source") or "").strip().lower()
    kind = str(definition.get("definition_kind") or "").strip().lower()
    role = str(definition.get("role") or "").strip().lower()
    if source in DETAIL_SOURCES or kind == "lexical_detail":
        return True
    if role == "fuller":
        return True
    return False


def definition_texts(definition: dict[str, Any]) -> list[tuple[str, str]]:
    """Return (field, text) pairs for locale fields present on a definition row."""
    out: list[tuple[str, str]] = []
    for field in ("text", "text_en", "text_es", "text_he"):
        value = definition.get(field)
        if isinstance(value, str) and value.strip():
            out.append((field, value))
    return out


def audit_definition_row(
    definition: dict[str, Any],
    *,
    max_gloss_chars: int = DEFAULT_MAX_GLOSS_CHARS,
    treat_as_primary: bool | None = None,
) -> list[str]:
    """Return issue strings for one definition row."""
    issues: list[str] = []
    primary = treat_as_primary
    if primary is None:
        primary = not is_detail_definition(definition)

    for field, text in definition_texts(definition):
        if has_forbidden_controls(text):
            issues.append(f"{field}: forbidden Unicode control/BiDi characters")
        if primary and len(text) > max_gloss_chars:
            issues.append(
                f"{field}: primary gloss length {len(text)} exceeds {max_gloss_chars}"
            )
        if primary and is_detail_definition(definition):
            issues.append(f"{field}: detail/fuller row marked as primary")
    return issues


def audit_entry_definitions(
    strong: str,
    definitions: Iterable[dict[str, Any]],
    *,
    max_gloss_chars: int = DEFAULT_MAX_GLOSS_CHARS,
) -> list[str]:
    """Audit a Strong's definition list. Detail/fuller rows must not be primary."""
    issues: list[str] = []
    rows = list(definitions)
    has_short = any(
        not is_detail_definition(row)
        and any(text.strip() for _, text in definition_texts(row))
        for row in rows
    )
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            issues.append(f"{strong} definitions[{index}]: not an object")
            continue
        if is_detail_definition(row) and has_short:
            # Detail beside a short is OK in data; flag only if someone also
            # marked it as a primary/short role incorrectly.
            role = str(row.get("role") or "").strip().lower()
            if role == "short":
                issues.append(
                    f"{strong} definitions[{index}]: detail/fuller row has role=short"
                )
            continue
        for issue in audit_definition_row(
            row,
            max_gloss_chars=max_gloss_chars,
            treat_as_primary=not is_detail_definition(row),
        ):
            issues.append(f"{strong} definitions[{index}]: {issue}")
    return issues


def audit_custom_definitions(
    custom: dict[str, Any],
    *,
    max_gloss_chars: int = DEFAULT_MAX_GLOSS_CHARS,
    sample_limit: int | None = None,
) -> dict[str, Any]:
    """Scan custom_definitions.json-shaped data; return counts + sample issues."""
    issues: list[str] = []
    control_hits = 0
    long_primary = 0
    detail_as_short = 0
    checked = 0

    for strong, entry in custom.items():
        if not isinstance(entry, dict):
            continue
        definitions = entry.get("definitions") or []
        if not isinstance(definitions, list):
            continue
        checked += 1
        entry_issues = audit_entry_definitions(
            str(strong),
            definitions,
            max_gloss_chars=max_gloss_chars,
        )
        for issue in entry_issues:
            if "forbidden Unicode" in issue:
                control_hits += 1
            if "primary gloss length" in issue:
                long_primary += 1
            if "role=short" in issue:
                detail_as_short += 1
        if sample_limit is None or len(issues) < sample_limit:
            remaining = (
                sample_limit - len(issues) if sample_limit is not None else None
            )
            if remaining is None:
                issues.extend(entry_issues)
            else:
                issues.extend(entry_issues[:remaining])

    return {
        "entries_checked": checked,
        "control_char_hits": control_hits,
        "long_primary_hits": long_primary,
        "detail_as_short_hits": detail_as_short,
        "sample_issues": issues,
    }
