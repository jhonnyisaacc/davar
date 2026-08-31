import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts" / "dict"))

from instance_policy import POLICY_VERSION, process_instances, resolve_conflict


def test_tiers_and_high_surface_are_bounded_and_deterministic():
    instances = [f"genesis.{(i % 50) + 1}.{(i % 20) + 1}.{i}" for i in range(1000)]
    result = process_instances(instances)
    assert result["policy_version"] == POLICY_VERSION
    assert result["tier"] == "high"
    assert result["total"] == 1000
    assert result["surface_count"] == 500
    assert result["omitted_count"] == 500
    assert process_instances(instances)["instances"] == result["instances"]


def test_duplicate_reference_keeps_highest_confidence_and_retains_full_set():
    result = process_instances([
        {"reference": "exodus.2.3", "confidence": 0.2, "id": "low"},
        {"reference": "exodus.2.3", "confidence": 0.9, "id": "high"},
        "genesis.1.1",
    ])
    assert result["total"] == 2
    assert result["instances"][0]["id"] == "high"
    assert result["duplicate_reference_keys"] == ["exodus.2.3.0"]


def test_malformed_location_and_confidence_are_findings_not_silent_drops():
    result = process_instances([
        "not-a-reference",
        {"reference": "genesis.1.1", "confidence": 2},
    ])
    assert len(result["findings"]) == 2
    assert result["total"] == 0


def test_conflict_uses_lexical_fallback_and_marks_review_on_tie():
    result = resolve_conflict([
        {"candidate": "zeta", "confidence": 0.8, "signal": 1, "sources": ["a"]},
        {"candidate": "alpha", "confidence": 0.8, "signal": 1, "sources": ["a"]},
    ])
    assert result["candidate"] == "alpha"
    assert result["needs_review"] is True
