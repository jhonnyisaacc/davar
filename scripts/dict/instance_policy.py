"""Deterministic, bounded handling for dictionary instances (issue #94).

The policy is deliberately independent of the scanners: callers can feed it
manual, OT, or NT records and retain the original record for audit/display.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from copy import deepcopy
import hashlib
import json
import unicodedata
from typing import Any, Iterable, Mapping


POLICY_VERSION = "1.1"
MISSING_POSITION = 2**31 - 1


@dataclass(frozen=True)
class InstancePolicyConfig:
    version: str = POLICY_VERSION
    medium_threshold: int = 100
    high_threshold: int = 1_000
    high_surface_limit: int = 500
    book_order: Mapping[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not (0 <= self.medium_threshold < self.high_threshold):
            raise ValueError("thresholds must satisfy 0 <= medium < high")
        if self.high_surface_limit < 1:
            raise ValueError("high_surface_limit must be positive")


DEFAULT_CONFIG = InstancePolicyConfig()


def _text(value: Any) -> str:
    return unicodedata.normalize("NFC", str(value).strip()) if value is not None else ""


def _canonical(value: Any) -> Any:
    """Return JSON-compatible data with NFC normalization applied recursively."""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, Mapping):
        return {str(key): _canonical(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_canonical(item) for item in value]
    return value


def _number(value: Any, field: str) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def reference_key(instance: Mapping[str, Any]) -> tuple[Any, ...] | None:
    """Return the stable location key, or None when location is malformed."""
    book = _text(instance.get("book"))
    chapter = _number(instance.get("chapter"), "chapter")
    verse = _number(instance.get("verse"), "verse")
    positions = instance.get("word_positions", instance.get("token"))
    if not book or chapter is None or verse is None or chapter < 1 or verse < 1:
        return None
    if positions is None:
        position_key: tuple[Any, ...] = (MISSING_POSITION,)
    elif isinstance(positions, (list, tuple)):
        position_key = tuple(_number(p, "token") for p in positions)
        if any(p is None for p in position_key):
            return None
    else:
        token = _number(positions, "token")
        if token is None:
            return None
        position_key = (token,)
    return (book, chapter, verse, *position_key)


def _stable_id(instance: Mapping[str, Any], key: tuple[Any, ...]) -> str:
    supplied = _text(instance.get("stable_id", instance.get("id", "")))
    if supplied:
        return supplied
    source_payload = {
        key: value for key, value in instance.items()
        if key not in {"stable_id", "id", "_reference_key"}
    }
    source_payload = _canonical(source_payload)
    for field in ("book", "display", "text", "source"):
        if isinstance(source_payload.get(field), str):
            source_payload[field] = source_payload[field].strip()
    canonical = json.dumps(
        _canonical({"payload": source_payload, "reference": key}),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _confidence(instance: Mapping[str, Any]) -> float:
    value = instance.get("confidence", 0)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _signal(instance: Mapping[str, Any]) -> float:
    value = instance.get("linguistic_signal", instance.get("signal_score", 0))
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _source_priority(instance: Mapping[str, Any]) -> int:
    value = instance.get("canonical_source_priority", instance.get("source_priority", 0))
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _book_order(instance: Mapping[str, Any], config: InstancePolicyConfig = DEFAULT_CONFIG) -> int:
    explicit = instance.get("book_order")
    if explicit is not None:
        try:
            return int(explicit)
        except (TypeError, ValueError):
            pass
    return config.book_order.get(_text(instance.get("book")), 10**9)


def _ranking_reference(instance: Mapping[str, Any], key: tuple[Any, ...]) -> tuple[Any, ...]:
    """Reference ordering with a fixed missing-token sentinel."""
    book = _text(instance.get("book"))
    chapter = key[1] if len(key) > 1 else MISSING_POSITION
    verse = key[2] if len(key) > 2 else MISSING_POSITION
    token = key[3] if len(key) > 3 else MISSING_POSITION
    return (book, chapter, verse, token)


def validate_instances(instances: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Return machine-readable findings without mutating input records."""
    records = list(instances)
    findings: list[dict[str, Any]] = []
    seen: dict[tuple[Any, ...], int] = {}
    payloads: dict[str, tuple[Any, ...]] = {}
    for index, item in enumerate(records):
        key = reference_key(item)
        if key is None:
            findings.append({"code": "malformed_location", "index": index, "severity": "error"})
        else:
            if key in seen:
                findings.append({"code": "duplicate_reference", "index": index, "first_index": seen[key], "severity": "warning", "reference_key": list(key)})
            seen.setdefault(key, index)
        confidence = item.get("confidence", 0)
        try:
            valid_confidence = 0 <= float(confidence) <= 1
        except (TypeError, ValueError):
            valid_confidence = False
        if not valid_confidence:
            findings.append({"code": "invalid_confidence", "index": index, "severity": "error"})
        if not _text(item.get("stable_id", item.get("id", ""))):
            findings.append({"code": "missing_stable_identifier", "index": index, "severity": "warning"})
        payload = tuple(sorted((str(k), json.dumps(v, ensure_ascii=False, sort_keys=True, default=str)) for k, v in item.items() if k not in {"book", "chapter", "verse", "word_positions", "token", "stable_id", "id"}))
        if payload in payloads.values() and key is not None:
            prior = next(k for k, v in payloads.items() if v == payload)
            if prior != ".".join(map(str, key)):
                findings.append({"code": "repeated_payload", "index": index, "severity": "warning"})
        if key is not None:
            payloads[".".join(map(str, key))] = payload
    return findings


def normalize_instances(instances: Iterable[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Normalize comparison fields, reject malformed records, deduplicate by reference."""
    records = list(instances)
    findings = validate_instances(records)
    by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    for item in records:
        key = reference_key(item)
        if key is None:
            continue
        normalized = deepcopy(dict(item))
        for field in ("book", "display", "text", "source"):
            if field in normalized and isinstance(normalized[field], str):
                normalized[field] = _text(normalized[field])
        normalized["book"] = _text(normalized["book"])
        normalized["_reference_key"] = key
        current = by_key.get(key)
        candidate_sort = (-_confidence(normalized), _stable_id(normalized, key))
        current_sort = (-_confidence(current), _stable_id(current, key)) if current else None
        if current is None or candidate_sort < current_sort:
            by_key[key] = normalized
    return list(by_key.values()), findings


def rank_instances(instances: Iterable[Mapping[str, Any]], config: InstancePolicyConfig = DEFAULT_CONFIG) -> list[dict[str, Any]]:
    """Stable descending policy order; no insertion/filesystem/time values participate."""
    records = [deepcopy(dict(x)) for x in instances]
    for item in records:
        key = item.get("_reference_key") or reference_key(item) or ("", 0, 0)
        item["_reference_key"] = key
    # Canonical book order precedes chapter/verse/token in the final tie-break.
    return sorted(records, key=lambda x: (
        -_confidence(x), -_signal(x), -_source_priority(x),
        _book_order(x, config), _ranking_reference(x, x["_reference_key"]),
        _stable_id(x, x["_reference_key"]),
    ))


def classify_tier(count: int, config: InstancePolicyConfig = DEFAULT_CONFIG) -> str:
    if count < config.medium_threshold:
        return "low"
    if count < config.high_threshold:
        return "medium"
    return "high"


def process_instances(instances: Iterable[Mapping[str, Any]], config: InstancePolicyConfig = DEFAULT_CONFIG) -> dict[str, Any]:
    """Apply normalization, ranking, tier surface limits, and validation metadata."""
    records = [deepcopy(dict(x)) for x in instances]
    conflict_findings: list[dict[str, Any]] = []
    for record in records:
        candidates = record.get("candidates")
        if not isinstance(candidates, list) or len(candidates) < 2:
            continue
        winner, needs_review, reason = resolve_conflict(candidates)
        record["assignment"] = winner.get("assignment", winner.get("candidate"))
        if needs_review:
            record["needs_review"] = True
        conflict_findings.append({
            "code": "conflicting_assignments", "severity": "warning",
            "reference_key": list(reference_key(record) or ()), "candidates": candidates,
            "winner": winner, "reason": reason,
        })
    normalized, findings = normalize_instances(records)
    findings.extend(conflict_findings)
    ranked = rank_instances(normalized, config)
    tier = classify_tier(len(ranked), config)
    surface = ranked[: config.high_surface_limit] if tier == "high" else ranked
    if tier == "high" and len(surface) != min(config.high_surface_limit, len(ranked)):
        findings.append({"code": "surface_count_mismatch", "severity": "error"})
    for item in surface + ranked[len(surface):]:
        item.pop("_reference_key", None)
    errors = [finding for finding in findings if finding.get("severity") == "error"]
    return {"policy_version": config.version, "tier": tier, "instances": ranked, "surface_instances": surface, "instance_total": len(ranked), "instance_surface_count": len(surface), "omitted_count": len(ranked) - len(surface), "findings": findings, "validation_errors": errors, "is_valid": not errors}


def resolve_conflict(candidates: Iterable[Mapping[str, Any]]) -> tuple[dict[str, Any], bool, str]:
    """Resolve one assignment conflict; return winner, needs_review, reason."""
    options = [deepcopy(dict(c)) for c in candidates]
    if not options:
        raise ValueError("at least one candidate is required")
    options.sort(key=lambda c: (-_confidence(c), -_signal(c), -int(c.get("independent_sources", c.get("source_count", 0)) or 0), _text(c.get("candidate", c.get("assignment", "")))))
    winner = options[0]
    tied = len(options) > 1 and all((_confidence(c), _signal(c), int(c.get("independent_sources", c.get("source_count", 0)) or 0)) == (_confidence(winner), _signal(winner), int(winner.get("independent_sources", winner.get("source_count", 0)) or 0)) for c in options[1:])
    return winner, tied, "lexicographic_fallback" if tied else "highest_confidence_signal_sources"
