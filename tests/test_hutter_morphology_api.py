from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.hutter.review_morphology_api import (
    build_messages,
    candidate_ids,
    compact_item,
    completed_items,
    parse_json_response,
    post_batch,
    summary_for,
    validate_response,
)


def queue_item(normalized: str = "אביר") -> dict:
    return {
        "normalized": normalized,
        "occurrence_count": 2,
        "review_status": "review",
        "candidates": [
            {
                "strong": "H46",
                "score": 0.98,
                "parse": {"stem": normalized, "suffixes": []},
                "evidence": "lexical",
            },
            {"strong": "H953", "score": 0.8, "parse": {"stem": "ביר"}},
        ],
        "occurrences": [
            {
                "book": "acts",
                "chapter": 22,
                "verse": 25,
                "position": 5,
                "text": "אָבִיר",
            }
        ],
    }


def test_candidate_ids_are_closed_and_sorted():
    assert candidate_ids(queue_item()) == ["H46", "H953"]


def test_compact_item_excludes_unneeded_image_and_provenance_fields():
    compact = compact_item(queue_item())
    assert compact["item"] == "אביר"
    assert compact["occurrences"][0]["surface"] == "אָבִיר"
    assert "position" not in compact["occurrences"][0]
    assert "source_image" not in compact["occurrences"][0]
    assert {candidate["strong"] for candidate in compact["candidates"]} == {
        "H46",
        "H953",
    }


def test_prompt_contains_closed_set_and_no_positional_alignment_instruction():
    messages = build_messages([queue_item()])
    assert "candidate list is closed" in messages[0]["content"]
    assert "word position" in messages[0]["content"]
    assert '"H46"' in messages[1]["content"]


def test_parse_json_response_accepts_fenced_and_wrapped_json():
    assert parse_json_response('```json\n[{"item":"אביר"}]\n```') == [{"item": "אביר"}]
    assert parse_json_response('{"items":[{"item":"אביר"}]}') == [{"item": "אביר"}]


def test_validate_response_requires_whitelisted_choice_and_complete_batch():
    item = queue_item()
    result = validate_response(
        [
            {
                "item": "אביר",
                "choice": "H46",
                "confidence": "high",
                "reason": "Exact lexical candidate.",
            }
        ],
        [item],
    )
    assert result["אביר"]["choice"] == "H46"
    with pytest.raises(ValueError, match="non-whitelisted"):
        validate_response(
            [
                {
                    "item": "אביר",
                    "choice": "H999",
                    "confidence": "high",
                    "reason": "Guess.",
                }
            ],
            [item],
        )
    with pytest.raises(ValueError, match="abstain"):
        validate_response(
            [
                {
                    "item": "אביר",
                    "choice": None,
                    "confidence": "low",
                    "reason": "Ambiguous.",
                }
            ],
            [item],
        )
    with pytest.raises(ValueError, match="exactly"):
        validate_response(
            [
                {
                    "item": "אביר",
                    "choice": "H46",
                    "confidence": "high",
                    "reason": "Exact.",
                    "extra": True,
                }
            ],
            [item],
        )
    with pytest.raises(ValueError, match="30 words"):
        validate_response(
            [
                {
                    "item": "אביר",
                    "choice": "H46",
                    "confidence": "high",
                    "reason": "word " * 31,
                }
            ],
            [item],
        )


def test_checkpoint_and_summary_ignore_errors_as_completed(tmp_path: Path):
    output = tmp_path / "proposals.jsonl"
    output.write_text(
        "\n".join(
            [
                json.dumps({"item": "אביר", "status": "error"}, ensure_ascii=False),
                json.dumps(
                    {"item": "אבוד", "status": "abstain", "choice": None},
                    ensure_ascii=False,
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    assert completed_items(output) == {"אבוד"}
    summary = summary_for(
        output, model="test/model", queue_sha256="abc", planned_count=2
    )
    assert summary["completed_items"] == 1
    assert summary["proposal_count"] == 0
    assert summary["status_counts"] == {"abstain": 1, "error": 1}


def test_post_batch_uses_chat_completions_and_returns_raw_payload():
    class Response:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [{"message": {"content": "[]"}}],
                "usage": {"total_tokens": 4},
            }

    class Client:
        def __init__(self):
            self.request = None

        def post(self, path, *, json):
            self.request = (path, json)
            return Response()

    client = Client()
    content, payload = post_batch(
        client,
        model="test/model",
        messages=[{"role": "user", "content": "test"}],
        max_output_tokens=10,
        retries=0,
    )
    assert content == "[]"
    assert payload["usage"]["total_tokens"] == 4
    assert client.request[0] == "/chat/completions"
    assert client.request[1]["model"] == "test/model"
    assert client.request[1]["temperature"] == 0
