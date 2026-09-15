from __future__ import annotations

import json
from pathlib import Path

from scripts.hutter.apply_morphology_api_proposals import (
    best_selected_candidate,
    build_overrides,
)
from scripts.hutter.map_strongs import load_manual_overrides, manual_override_decision


def queue_item() -> dict:
    return {
        "normalized": "באור",
        "candidates": [
            {
                "strong": "H216",
                "score": 0.93,
                "base_score": 0.98,
                "corpus_count": 184,
                "parse": {
                    "prefixes": ["Hb"],
                    "stem": "אור",
                    "suffixes": [],
                    "parse_label": "lexical",
                },
                "evidence": "lexical with preposition",
            },
            {
                "strong": "H216",
                "score": 0.90,
                "base_score": 0.98,
                "corpus_count": 184,
                "parse": {"prefixes": [], "stem": "באור"},
            },
        ],
    }


def test_best_selected_candidate_preserves_highest_scoring_prefix_parse():
    selected = best_selected_candidate(queue_item(), "H216")
    assert selected["parse"]["prefixes"] == ["Hb"]


def test_build_overrides_is_closed_set_and_provenance_rich(tmp_path: Path):
    queue_path = tmp_path / "queue.json"
    queue_path.write_text(
        json.dumps({"queue": [queue_item()]}, ensure_ascii=False), encoding="utf-8"
    )
    checkpoint_path = tmp_path / "checkpoint.jsonl"
    checkpoint_path.write_text(
        json.dumps(
            {
                "item": "באור",
                "status": "proposed",
                "choice": "H216",
                "confidence": "medium",
                "reason": "Best supplied lexical candidate.",
                "model": "openai/gpt-5.6-luna",
                "review_pass": "reconsider_abstentions",
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    overrides, queue_sha256, model = build_overrides(queue_path, checkpoint_path)
    assert len(overrides) == 1
    assert overrides[0]["strong"] == "Hb/H216"
    assert overrides[0]["source"] == "openrouter_morphology_review"
    assert overrides[0]["candidate_parse"]["stem"] == "אור"
    assert queue_sha256
    assert model == "openai/gpt-5.6-luna"


def test_api_override_preserves_confidence_and_method():
    decision = manual_override_decision(
        {
            "strong": "Hb/H216",
            "prefixes": ["Hb"],
            "source": "openrouter_morphology_review",
            "confidence": "low",
        }
    )
    assert decision is not None
    assert decision.confidence == "low"
    assert decision.method == "morphology_api_override"


def test_human_override_wins_over_api_override(tmp_path: Path, monkeypatch):
    api_path = tmp_path / "api.json"
    human_path = tmp_path / "human.json"
    api_path.write_text(
        json.dumps(
            [
                {
                    "forms": ["אביר"],
                    "strong": "H46",
                    "source": "openrouter_morphology_review",
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    human_path.write_text(
        json.dumps([{"forms": ["אביר"], "strong": "H47"}], ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "scripts.hutter.map_strongs.MORPHOLOGY_API_OVERRIDES_PATH", api_path
    )
    monkeypatch.setattr("scripts.hutter.map_strongs.MANUAL_OVERRIDES_PATH", human_path)

    overrides, contextual = load_manual_overrides()

    assert overrides["אביר"]["strong"] == "H47"
    assert contextual == {}
