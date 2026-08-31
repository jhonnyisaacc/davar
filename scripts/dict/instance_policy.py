"""Deterministic, bounded handling for dictionary entry instances (issue #94)."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

POLICY_VERSION = "1.0"
LOW_MAX = 99
MEDIUM_MAX = 999
HIGH_SURFACE_LIMIT = 500
_REFERENCE_RE = re.compile(r"^([a-z0-9_]+)\.(\d+)\.(\d+)(?:\.(\d+))?$", re.I)

# Canonical order is explicit and stable; unknown books sort after known books.
_BOOK_ORDER = {name: i for i, name in enumerate((
    "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua",
    "judges", "samuel_1", "samuel_2", "kings_1", "kings_2", "isaiah",
    "jeremiah", "ezekiel", "hosea", "joel", "amos", "obadiah", "jonah",
    "micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah",
    "malachi", "psalms", "proverbs", "job", "songofsolomon", "ruth",
    "lamentations", "ecclesiastes", "esther", "daniel", "ezra", "nehemiah",
), 1)}

@dataclass(frozen=True)
class _Candidate:
    original: Any
    key: str
    book: str
    chapter: int
    verse: int
    token: int
    confidence: float
    signal: float
    source_priority: int
    stable_id: str


def _number(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse(instance: Any, index: int) -> Tuple[Optional[_Candidate], Optional[str]]:
    if isinstance(instance, str):
        display = unicodedata.normalize("NFC", instance.strip())
        match = _REFERENCE_RE.fullmatch(display)
        if not match:
            return None, f"instance {index}: malformed location"
        book, chapter, verse, token = match.groups()
        payload: Dict[str, Any] = {"reference": display}
    elif isinstance(instance, dict):
        payload = instance
        raw = str(instance.get("reference", "")).strip()
        match = _REFERENCE_RE.fullmatch(raw)
        book = str(instance.get("book", match.group(1) if match else "")).strip().lower()
        chapter = instance.get("chapter", match.group(2) if match else None)
        verse = instance.get("verse", match.group(3) if match else None)
        token = instance.get("token", instance.get("index", match.group(4) if match else 0))
        if not book or chapter is None or verse is None:
            return None, f"instance {index}: missing location"
        display = unicodedata.normalize("NFC", raw or f"{book}.{chapter}.{verse}")
    else:
        return None, f"instance {index}: unsupported record"
    try:
        chapter_i, verse_i, token_i = int(chapter), int(verse), int(token or 0)
    except (TypeError, ValueError):
        return None, f"instance {index}: invalid numeric location"
    if chapter_i < 1 or verse_i < 1 or token_i < 0:
        return None, f"instance {index}: invalid numeric range"
    confidence = (_number(payload.get("confidence"), 0.0) or 0.0) if isinstance(payload, dict) else 0.0
    signal = (_number(payload.get("linguistic_signal", payload.get("signal")), 0.0) or 0.0) if isinstance(payload, dict) else 0.0
    if confidence is None or not 0 <= confidence <= 1:
        return None, f"instance {index}: invalid confidence"
    stable_id = str(payload.get("id", display) if isinstance(payload, dict) else display)
    source_priority = int(payload.get("source_priority", 0) or 0) if isinstance(payload, dict) else 0
    key = f"{book.lower()}.{chapter_i}.{verse_i}.{token_i}"
    return _Candidate(instance, key, book.lower(), chapter_i, verse_i, token_i, confidence, signal, source_priority, stable_id), None


def _rank_key(item: _Candidate) -> tuple:
    return (-item.confidence, -item.signal, -item.source_priority,
            _BOOK_ORDER.get(item.book, 10_000), item.chapter, item.verse,
            item.token, item.stable_id, item.key)


def classify_tier(count: int) -> str:
    if count <= LOW_MAX:
        return "low"
    if count <= MEDIUM_MAX:
        return "medium"
    return "high"


def process_instances(instances: Iterable[Any]) -> Dict[str, Any]:
    """Normalize, validate, deduplicate and rank instances without losing source data."""
    candidates: Dict[str, _Candidate] = {}
    findings: List[Dict[str, str]] = []
    duplicate_keys: List[str] = []
    for index, instance in enumerate(instances):
        candidate, error = _parse(instance, index)
        if error:
            findings.append({"kind": "validation", "message": error})
            continue
        assert candidate is not None
        prior = candidates.get(candidate.key)
        if prior is not None:
            duplicate_keys.append(candidate.key)
            if _rank_key(candidate) < _rank_key(prior):
                candidates[candidate.key] = candidate
        else:
            candidates[candidate.key] = candidate
    ranked = sorted(candidates.values(), key=_rank_key)
    tier = classify_tier(len(ranked))
    surface = ranked[:HIGH_SURFACE_LIMIT] if tier == "high" else ranked
    return {
        "policy_version": POLICY_VERSION,
        "tier": tier,
        "total": len(ranked),
        "surface_count": len(surface),
        "omitted_count": len(ranked) - len(surface),
        "instances": [item.original for item in ranked],
        "surface_instances": [item.original for item in surface],
        "duplicate_reference_keys": sorted(set(duplicate_keys)),
        "findings": findings,
    }


def resolve_conflict(candidates: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """Resolve assignments by confidence, signal, independent-source count, then lexical value."""
    values = list(candidates)
    if not values:
        raise ValueError("at least one candidate is required")
    def key(item: Dict[str, Any]) -> tuple:
        confidence = _number(item.get("confidence"), 0.0) or 0.0
        signal = _number(item.get("linguistic_signal", item.get("signal")), 0.0) or 0.0
        sources = len(set(item.get("sources", []))) if isinstance(item.get("sources", []), list) else 0
        normalized = unicodedata.normalize("NFC", str(item.get("candidate", "")))
        return (-confidence, -signal, -sources, normalized)
    winner = min(values, key=key)
    result = dict(winner)
    if len(values) > 1 and len({key(v)[:3] for v in values}) == 1:
        result["needs_review"] = True
    return result
