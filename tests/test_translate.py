from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.translate.adapters.concepts import ConceptsAdapter
from scripts.translate.adapters.lexicon import LexiconAdapter, apply_text_fields
from scripts.translate.adapters.locales import LocalesAdapter, flatten_leaves, set_leaf
from scripts.translate.cache import empty_cache, load_cache, source_hash
from scripts.translate.client import (
    FakeTransport,
    LiveTransport,
    MissingApiKeyError,
    build_request_body,
    is_budget_error,
    message_text,
    parse_sse,
    retry_after_seconds,
    supports_structured_output,
)
from scripts.translate.engine import (
    TranslateJob,
    estimate_jobs,
    pack_batches,
    parse_translations,
    run_jobs,
    unique_jobs,
)
from scripts.translate.__main__ import main

FIXTURES = Path(__file__).parent / "fixtures" / "translate"


def job(item_id: str, target: str, text: str, extra: str = "", key: str | None = None) -> TranslateJob:
    return TranslateJob(
        item_id=item_id,
        cache_key=key or source_hash(target, text, extra),
        target=target,
        text=text,
        extra=extra,
    )


def test_source_hash_is_stable():
    assert source_hash("pt", "father") == source_hash("pt", "father")
    assert source_hash("pt", "father") != source_hash("ar", "father")


def test_pack_batches_respects_item_and_char_budget():
    jobs = [
        job(f"n{index}", "pt", "word " * 20, key=f"k{index}")
        for index in range(5)
    ]
    batches = pack_batches(jobs, batch_chars=80, max_items=2)
    assert all(len(batch) <= 2 for batch in batches)
    assert sum(len(batch) for batch in batches) == 5


def test_unique_jobs_dedupe_identical_source():
    first = job("a", "pt", "father", key="same")
    second = job("b", "pt", "father", key="same")
    assert len(unique_jobs([first, second])) == 1


def test_parse_translations_uses_item_ids_not_order():
    jobs = [job("1", "pt", "father"), job("2", "pt", "son")]
    parsed, skipped = parse_translations(
        json.dumps(
            {
                "t": [
                    {"i": "1", "s": "filho"},
                    {"i": "0", "s": "pai"},
                ]
            }
        ),
        jobs,
    )
    assert parsed[jobs[0].cache_key]["text"] == "pai"
    assert parsed[jobs[1].cache_key]["text"] == "filho"
    assert skipped == []


def test_parse_translations_defers_missing_ids():
    jobs = [job("1", "pt", "father"), job("2", "pt", "son")]
    parsed, skipped = parse_translations(
        '{"t":[{"i":"0","s":"pai"}]}',
        jobs,
    )
    assert jobs[0].cache_key in parsed
    assert skipped == [jobs[1]]


def test_retry_after_reads_header_and_openrouter_body():
    assert retry_after_seconds({"Retry-After": "12"}, 0) == 12
    detail = json.dumps(
        {"error": {"metadata": {"headers": {"Retry-After": "120"}}}}
    )
    assert retry_after_seconds({}, 0, detail) == 120
    assert retry_after_seconds(None, 0) == 1
    assert is_budget_error(RuntimeError("OpenRouter HTTP 402: in_flight"))
    assert not is_budget_error(RuntimeError("missing translation"))


def test_message_text_and_sse_parser():
    assert (
        message_text(
            {"choices": [{"message": {"content": "", "reasoning": '{"t":[]}'}}]}
        )
        == '{"t":[]}'
    )
    chunks = [
        'data: {"choices":[{"delta":{"content":"{\\"t\\":["}}]}',
        'data: {"choices":[{"delta":{"content":"]}"}}], "usage":{"prompt_tokens":3,"completion_tokens":4}}',
        "data: [DONE]",
    ]
    result = parse_sse(chunks)
    assert result.text == '{"t":[]}'
    assert result.usage["prompt_tokens"] == 3
    assert result.usage["completion_tokens"] == 4


def test_build_request_body_defaults_to_latency_without_healing():
    body = build_request_body(
        [{"role": "user", "content": "[]"}],
        "google/gemini-2.5-flash",
        session_id="davar-translate-test",
    )
    assert body["stream"] is True
    assert body["provider"]["sort"] == "latency"
    assert body["session_id"] == "davar-translate-test"
    assert body["response_format"]["type"] == "json_schema"
    assert "plugins" not in body
    assert "reasoning" not in body
    assert supports_structured_output("google/gemini-2.5-flash")
    assert not supports_structured_output("nvidia/x:free")


def test_live_transport_refuses_missing_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(MissingApiKeyError):
        LiveTransport(api_key="")


def test_fake_stream_client_writes_cache(tmp_path: Path):
    jobs = [job("1", "pt", "father"), job("2", "pt", "son")]
    cache = empty_cache()
    transport = FakeTransport()
    result = run_jobs(
        jobs,
        cache,
        tmp_path / "cache.json",
        transport=transport,
        model="fake-model",
    )
    assert transport.calls
    assert result["stats"]["rows"] == 2
    assert cache["items"][jobs[0].cache_key]["text"].startswith("[fake] ")
    saved = load_cache(tmp_path / "cache.json")
    assert jobs[0].cache_key in saved["items"]


def test_dry_run_does_not_call_transport(tmp_path: Path):
    def boom(_body, _headers):
        raise AssertionError("dry-run must not call a transport")

    transport = FakeTransport(handler=boom)
    result = run_jobs(
        [job("1", "pt", "father")],
        empty_cache(),
        tmp_path / "cache.json",
        transport=transport,
        dry_run=True,
    )
    assert result["stats"]["rows"] == 1
    assert transport.calls == []


def test_lexicon_adapter_skips_filled_and_applies_cache(tmp_path: Path):
    path = tmp_path / "lexicon.json"
    path.write_text((FIXTURES / "lexicon.json").read_text(encoding="utf-8"), encoding="utf-8")
    adapter = LexiconAdapter(paths=[path])
    jobs = adapter.collect(("pt", "es"))
    assert {job.text for job in jobs} == {"ancestor", "father"}
    assert all(job.target == "pt" for job in jobs) or {"pt", "es"} >= {job.target for job in jobs}
    assert all(job.target != "es" or job.text == "ancestor" for job in jobs)

    cache = empty_cache()
    father = next(job for job in jobs if job.text == "father")
    cache["items"][father.cache_key] = {
        "text": "pai",
        "extra": "pai",
        "source_text_hash": father.cache_key,
    }
    applied = adapter.apply(cache, ("pt",), write=True)
    assert applied == 1
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["H1"]["definitions"][0]["text_pt"] == "pai"


def test_apply_text_fields_migrates_text_to_text_en():
    entries = {
        "H2": {
            "definitions": [
                {"text": "house", "order": 1},
            ]
        }
    }
    key = source_hash("lexicon", "pt", "house")
    applied = apply_text_fields(
        entries,
        {"items": {key: {"text": "casa"}}},
        ("pt",),
        source="lexicon",
    )
    assert applied == 1
    assert entries["H2"]["definitions"][0]["text_en"] == "house"
    assert entries["H2"]["definitions"][0]["text_pt"] == "casa"


def test_greek_adapter_collects_draft_rows():
    from scripts.translate.adapters.greek import GreekAdapter

    adapter = GreekAdapter(definitions_dir=FIXTURES / "greek")
    jobs = adapter.collect(("es",))
    assert jobs
    assert jobs[0].target == "es"
    assert jobs[0].text == "one"


def test_concepts_adapter_collects_missing_languages():
    adapter = ConceptsAdapter(paths=[FIXTURES / "concepts.json"])
    jobs = adapter.collect(("pt", "es"))
    assert len(jobs) == 1
    assert jobs[0].target == "pt"
    assert "MIGHTY ONE" in jobs[0].text


def test_locales_flatten_and_skip_existing():
    leaves = flatten_leaves({"a": {"b": "one"}, "c": "two"})
    assert dict(leaves) == {"a.b": "one", "c": "two"}
    payload: dict = {}
    set_leaf(payload, "a.b", "um")
    assert payload == {"a": {"b": "um"}}

    adapter = LocalesAdapter(locales_dir=FIXTURES / "locales")
    jobs = adapter.collect(("es", "pt"))
    paths = {(job.target, job.meta["path"]) for job in jobs}
    assert ("es", "common.loading") not in paths
    assert ("es", "wordCard.appearsCount") in paths
    assert ("pt", "common.loading") in paths
    assert "{count}" in next(
        job.text for job in jobs if job.meta["path"] == "wordCard.appearsCount"
    )


def test_cli_dry_run_and_fake_and_deferred_bench(tmp_path: Path, capsys):
    cache = tmp_path / "cache.json"
    assert (
        main(
            [
                "run",
                "--source",
                "lexicon",
                "--to",
                "pt",
                "--input",
                str(FIXTURES / "lexicon.json"),
                "--dry-run",
                "--cache",
                str(cache),
            ]
        )
        == 0
    )
    out = capsys.readouterr().out
    assert "rows" in out
    assert not cache.exists()

    assert (
        main(
            [
                "run",
                "--source",
                "concepts",
                "--to",
                "ar,fa",
                "--input",
                str(FIXTURES / "concepts.json"),
                "--dry-run",
            ]
        )
        == 0
    )
    assert (
        main(
            [
                "run",
                "--source",
                "locales",
                "--to",
                "pt",
                "--input",
                str(FIXTURES / "locales"),
                "--dry-run",
            ]
        )
        == 0
    )
    assert (
        main(
            [
                "run",
                "--source",
                "greek",
                "--to",
                "es,he",
                "--input",
                str(FIXTURES / "greek"),
                "--dry-run",
            ]
        )
        == 0
    )

    assert (
        main(
            [
                "run",
                "--source",
                "lexicon",
                "--to",
                "pt",
                "--input",
                str(FIXTURES / "lexicon.json"),
                "--fake",
                "--cache",
                str(cache),
            ]
        )
        == 0
    )
    saved = load_cache(cache)
    assert saved["items"]

    assert main(["bench", "--limit", "20"]) == 2
    assert (
        main(
            [
                "run",
                "--source",
                "lexicon",
                "--to",
                "pt",
                "--input",
                str(FIXTURES / "lexicon.json"),
                "--mode",
                "batch",
            ]
        )
        == 2
    )
    assert (
        main(
            [
                "bench",
                "--fake",
                "--limit",
                "2",
                "--source",
                "locales",
                "--to",
                "pt",
                "--input",
                str(FIXTURES / "locales"),
                "--cache",
                str(tmp_path / "bench.json"),
            ]
        )
        == 0
    )
    assert "items_per_sec" in capsys.readouterr().out


def test_estimate_jobs_counts_unique_rows():
    jobs = [job("a", "pt", "father", key="same"), job("b", "pt", "father", key="same")]
    stats = estimate_jobs(jobs)
    assert stats["rows"] == 2
    assert stats["unique"] == 1
    assert stats["batches"] == 1
