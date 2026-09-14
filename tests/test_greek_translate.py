import json

from scripts.greek.definitions import build_definitions
from scripts.greek.importer import build_bundle
from scripts.greek.parse_tbesg import parse_tbesg_file
from scripts.greek.parse_ubs import parse_ubs_file
from scripts.greek.text_clean import clean_lexical_text
from scripts.greek.translate import (
    Job,
    Settings,
    apply_translation_cache,
    collect_jobs,
    completion_request_body,
    is_budget_error,
    message_text,
    request_payload,
    estimate_jobs,
    pack_batches,
    parse_translations,
    retry_after_seconds,
    run_translation,
    source_hash,
    supports_structured_output,
    unique_jobs,
)
from pathlib import Path


def english_hash(definition: dict, target: str) -> str:
    short = clean_lexical_text(definition.get("short") or "")
    fuller = clean_lexical_text(definition.get("fuller") or "")
    if fuller == short:
        fuller = ""
    return source_hash(target, short, fuller)

FIXTURES = Path(__file__).parent / "fixtures" / "greek"


def load_store():
    bundle = build_bundle(
        [(FIXTURES / "tagnt_import_sample.tsv").read_text(encoding="utf-8")],
        (FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8"),
    )
    entries = parse_tbesg_file((FIXTURES / "tbesg_sample.tsv").read_text(encoding="utf-8"))
    ubs = parse_ubs_file((FIXTURES / "ubs_es_sample.json").read_text(encoding="utf-8"))
    displayed = set(bundle["occurrences"]) | {
        "G0002",
        "G0129G",
        "G0129H",
        "G1383G",
        "G1383H",
    }
    return build_definitions(entries, displayed, ubs)


def settings() -> Settings:
    return Settings(
        api_key="test",
        model="test-model",
        base_url="https://openrouter.ai/api/v1",
        concurrency=4,
        batch_chars=120,
        max_items=2,
    )


def test_kurios_spanish_is_queued_instead_of_ubs(tmp_path: Path):
    store = {
        "entries": {
            "G2962G": {
                "id": "G2962G",
                "lemma": "κύριος",
                "senses": [
                    {
                        "sense_id": "G2962G",
                        "definitions": {
                            "en": {
                                "short": "lord: God",
                                "fuller": "lord, God.†\n(AS)",
                            },
                            "es": {
                                "fuller": "título de respeto utilizado al abordar o hablar de un hombre",
                                "review_status": "imported",
                                "short": "señor",
                                "source": "ubs-es",
                            },
                        },
                    }
                ],
            }
        }
    }
    jobs = collect_jobs(store, ("es",))
    assert [job.entry_id for job in jobs] == ["G2962G"]
    result = run_translation(
        store, ("es",), tmp_path / "cache.json", script_only=True
    )
    spanish = store["entries"]["G2962G"]["senses"][0]["definitions"]["es"]
    assert result["stats"]["rows"] == 1
    assert spanish["source"] == "script-gloss"
    assert spanish["short"] == "lord: God"
    assert "título de respeto" not in (spanish.get("fuller") or "")


def test_collect_jobs_skips_ubs_and_filled_rows():
    store = load_store()
    leftover = store["entries"]["G1383H"]["senses"][0]["definitions"]["es"]
    leftover["short"] = "prueba"
    leftover["fuller"] = "prueba más larga"
    jobs = collect_jobs(store, ("es", "he"))
    spanish = [job for job in jobs if job.target == "es"]
    hebrew = [job for job in jobs if job.target == "he"]
    assert all(job.entry_id != "G0976" for job in spanish)
    assert all(job.entry_id != "G1383H" for job in spanish)
    assert hebrew
    assert {job.entry_id for job in hebrew} >= {"G0976", "G1383H"}


def test_collect_jobs_skips_cached_hashes():
    store = load_store()
    english = store["entries"]["G1383H"]["senses"][0]["definitions"]["en"]
    key = english_hash(english, "es")
    jobs = collect_jobs(
        store,
        ("es",),
        cache={"items": {key: {"short": "ya", "fuller": "ya está"}}},
    )
    assert all(job.cache_key != key for job in jobs)


def test_request_payload_omits_lemma_and_greek():
    jobs = [
        Job("G1", "G1", "es", "λέγω", "say", "to speak", "hash-1"),
    ]
    payload = request_payload(jobs)
    assert "l" not in payload[0]
    assert "λέγω" not in json.dumps(payload, ensure_ascii=False)


def test_pack_batches_respects_item_and_char_budget():
    jobs = [
        Job(
            entry_id=f"G{index}",
            sense_id=f"G{index}",
            target="es",
            lemma="λέγω",
            short="say " * 20,
            fuller="to speak at length " * 8,
            cache_key=f"k{index}",
        )
        for index in range(5)
    ]
    batches = pack_batches(jobs, batch_chars=200, max_items=2)
    assert all(len(batch) <= 2 for batch in batches)
    assert sum(len(batch) for batch in batches) == 5


def test_unique_jobs_dedupe_identical_english():
    first = Job("G1", "G1", "es", "α", "love", "affection", "same")
    second = Job("G2", "G2", "es", "β", "love", "affection", "same")
    assert len(unique_jobs([first, second])) == 1
    stats = estimate_jobs([first, second])
    assert stats["rows"] == 2
    assert stats["unique"] == 1


def test_parse_translations_accepts_fenced_json():
    jobs = [
        Job("G1", "G1", "es", "ἀγάπη", "love", "affection", "hash-1"),
        Job("G2", "G2", "es", "χάρις", "grace", "", "hash-2"),
    ]
    parsed, skipped = parse_translations(
        """```json
{"t":[{"i":"0","s":"amor","f":"afecto"},{"i":"1","s":"gracia"}]}
```""",
        jobs,
    )
    assert parsed["hash-1"]["short"] == "amor"
    assert parsed["hash-2"]["fuller"] == "gracia"
    assert skipped == []


def test_parse_translations_defers_missing_and_empty():
    jobs = [
        Job("G1", "G1", "es", "ἀγάπη", "love", "affection", "hash-1"),
        Job("G2", "G2", "es", "χάρις", "grace", "", "hash-2"),
        Job("G3", "G3", "es", "εἰρήνη", "peace", "", "hash-3"),
    ]
    parsed, skipped = parse_translations(
        '{"t":[{"i":"0","s":"amor","f":"afecto"},{"i":"2","s":""}]}',
        jobs,
    )
    assert list(parsed) == ["hash-1"]
    assert [job.cache_key for job in skipped] == ["hash-2", "hash-3"]


def test_apply_cache_never_overwrites_ubs(tmp_path: Path):
    store = load_store()
    book = store["entries"]["G0976"]["senses"][0]["definitions"]
    leftover_en = store["entries"]["G1383H"]["senses"][0]["definitions"]["en"]
    key = english_hash(book["en"], "es")
    leftover_key = english_hash(leftover_en, "es")
    apply_translation_cache(
        store,
        {
            "items": {
                key: {"short": "NO", "fuller": "NO"},
                leftover_key: {"short": "prueba", "fuller": "prueba completa"},
            },
            "model": "test-model",
        },
    )
    assert book["es"]["source"] == "ubs-es"
    assert book["es"]["short"] == "libro"
    filled = store["entries"]["G1383H"]["senses"][0]["definitions"]["es"]
    assert filled["short"] == "prueba"
    assert filled["source"] == "openrouter-tbesg"
    assert filled["review_status"] == "draft"
    assert filled["license"] == "CC-BY-4.0"


def test_run_translation_defers_missing_to_leftover_pass(tmp_path: Path):
    store = {
        "entries": {
            "G1": {
                "id": "G1",
                "lemma": "α",
                "senses": [
                    {
                        "sense_id": "G1",
                        "definitions": {
                            "en": {"short": "one", "fuller": "number one"},
                            "es": {"short": None, "fuller": None},
                        },
                    }
                ],
            },
            "G2": {
                "id": "G2",
                "lemma": "β",
                "senses": [
                    {
                        "sense_id": "G2",
                        "definitions": {
                            "en": {"short": "two", "fuller": "number two"},
                            "es": {"short": None, "fuller": None},
                        },
                    }
                ],
            },
        }
    }
    calls: list[list[str]] = []

    def chat(messages, target):
        payload = json.loads(messages[1]["content"].split("\n", 1)[1])
        calls.append([row["s"] for row in payload])
        if len(payload) > 1:
            return json.dumps({"t": [{"i": payload[0]["i"], "s": "uno", "f": "uno"}]})
        return json.dumps({"t": [{"i": payload[0]["i"], "s": "dos", "f": "dos"}]})

    wide = Settings(
        api_key="test",
        model="test-model",
        base_url="https://openrouter.ai/api/v1",
        concurrency=2,
        batch_chars=10_000,
        max_items=80,
    )
    result = run_translation(
        store,
        ("es",),
        tmp_path / "cache.json",
        settings=wide,
        chat=chat,
    )
    spanish = [
        store["entries"]["G1"]["senses"][0]["definitions"]["es"]["short"],
        store["entries"]["G2"]["senses"][0]["definitions"]["es"]["short"],
    ]
    assert result["stats"]["rows"] == 2
    assert set(spanish) == {"uno", "dos"}
    assert any(len(call) == 1 for call in calls)


def test_run_translation_resumes_and_calls_unique_batches(tmp_path: Path):
    store = load_store()
    calls: list[str] = []

    def chat(messages, target):
        calls.append(target)
        payload = json.loads(messages[1]["content"].split("\n", 1)[1])
        return json.dumps(
            {
                "t": [
                    {
                        "i": row["i"],
                        "s": f"{target}-{row['s'][:12]}",
                        "f": f"{target}-full",
                    }
                    for row in payload
                ]
            },
            ensure_ascii=False,
        )

    cache_path = tmp_path / "translation-cache.json"
    first = run_translation(
        store,
        ("es", "he"),
        cache_path,
        settings=settings(),
        chat=chat,
    )
    leftover = first["store"]["entries"]["G1383H"]["senses"][0]["definitions"]
    assert leftover["es"]["short"].startswith("es-")
    assert leftover["he"]["short"].startswith("he-")
    assert first["store"]["entries"]["G0976"]["senses"][0]["definitions"]["es"][
        "source"
    ] == "ubs-es"
    first_calls = len(calls)

    second = run_translation(
        first["store"],
        ("es", "he"),
        cache_path,
        settings=settings(),
        chat=chat,
    )
    assert second["stats"]["rows"] == 0
    assert len(calls) == first_calls


def test_script_localizes_abbrevs_and_still_queues_gloss(tmp_path: Path):
    store = {
        "entries": {
            "G0001": {
                "id": "G0001",
                "lemma": "Ἀαρών",
                "senses": [
                    {
                        "sense_id": "G0001",
                        "definitions": {
                            "en": {
                                "short": "Aaron",
                                "fuller": "Aaron (Exo.4:14, al.): Luk.1:5, Act.7:40.†\n(AS)",
                            },
                            "es": {"short": None, "fuller": None},
                            "he": {"short": None, "fuller": None},
                        },
                    }
                ],
            }
        }
    }
    result = run_translation(
        store, ("es", "he"), tmp_path / "cache.json", script_only=True
    )
    assert result["stats"]["script_filled"] == 2
    assert result["stats"]["rows"] == 2
    spanish = store["entries"]["G0001"]["senses"][0]["definitions"]["es"]
    hebrew = store["entries"]["G0001"]["senses"][0]["definitions"]["he"]
    assert spanish["source"] == "script-gloss"
    assert spanish["needs_prose"] is True
    assert "Aaron" in spanish["fuller"]
    assert "Hch.7:40" in spanish["fuller"]
    assert "Éx.4:14" in spanish["fuller"]
    assert "etc." in spanish["fuller"]
    assert "מע״ש.7:40" in hebrew["fuller"]


def test_script_only_fills_citation_rows(tmp_path: Path):
    store = {
        "entries": {
            "G0001": {
                "id": "G0001",
                "lemma": "Ἀαρών",
                "senses": [
                    {
                        "sense_id": "G0001",
                        "definitions": {
                            "en": {
                                "short": "Ἀαρών.†",
                                "fuller": "Ἀαρών.†\n(AS)",
                            },
                            "es": {"short": None, "fuller": None},
                            "he": {"short": None, "fuller": None},
                        },
                    }
                ],
            }
        }
    }
    cache_path = tmp_path / "cache.json"
    result = run_translation(store, ("es", "he"), cache_path, script_only=True)
    assert result["stats"]["script_filled"] == 2
    assert result["stats"]["rows"] == 0
    spanish = store["entries"]["G0001"]["senses"][0]["definitions"]["es"]
    assert spanish["source"] == "script-gloss"
    assert "†" in spanish["fuller"]
    assert "(AS)" in spanish["fuller"]


def test_dry_run_does_not_call_openrouter(tmp_path: Path):
    store = load_store()

    def chat(_messages, _target):
        raise AssertionError("dry-run must not call OpenRouter")

    result = run_translation(
        store,
        ("es",),
        tmp_path / "cache.json",
        dry_run=True,
        chat=chat,
    )
    assert result["stats"]["rows"] > 0
    assert store["entries"]["G1383H"]["senses"][0]["definitions"]["es"]["short"] is None


def test_free_models_skip_json_response_format():
    assert supports_structured_output("google/gemini-2.5-flash")
    assert not supports_structured_output(
        "nvidia/nemotron-3-ultra-550b-a55b:free"
    )


def test_completion_request_uses_throughput_and_json_schema():
    body = completion_request_body(
        [{"role": "user", "content": "[]"}],
        settings(),
    )
    assert body["provider"]["sort"] == "throughput"
    assert body["provider"]["require_parameters"] is True
    assert body["response_format"]["type"] == "json_schema"
    assert body["plugins"] == [{"id": "response-healing"}]
    assert body["reasoning"]["effort"] == "low"


def test_free_model_request_skips_structured_output():
    free = Settings(
        api_key="test",
        model="nvidia/nemotron-3-ultra-550b-a55b:free",
        base_url="https://openrouter.ai/api/v1",
        concurrency=2,
        batch_chars=120,
        max_items=2,
    )
    body = completion_request_body([{"role": "user", "content": "[]"}], free)
    assert "response_format" not in body
    assert "plugins" not in body
    assert body["provider"]["sort"] == "throughput"
    assert "require_parameters" not in body["provider"]


def test_message_text_reads_reasoning_when_content_empty():
    assert (
        message_text(
            {
                "choices": [
                    {
                        "message": {
                            "content": "",
                            "reasoning": '{"t":[]}',
                        }
                    }
                ]
            }
        )
        == '{"t":[]}'
    )


def test_retry_after_reads_openrouter_budget_body():
    from email.message import Message
    from urllib.error import HTTPError

    error = HTTPError(
        "https://openrouter.ai/api/v1/chat/completions",
        402,
        "Payment Required",
        Message(),
        None,
    )
    detail = json.dumps(
        {"error": {"metadata": {"headers": {"Retry-After": "120"}}}}
    )
    assert retry_after_seconds(error, 0, detail) == 120
    assert is_budget_error(RuntimeError("OpenRouter HTTP 402: in_flight"))
    assert not is_budget_error(RuntimeError("missing translation for item 1"))


def test_message_text_surfaces_choice_error():
    try:
        message_text({"choices": [{"error": {"code": 502, "message": "upstream"}}]})
    except RuntimeError as error:
        assert "502" in str(error)
        assert "upstream" in str(error)
    else:
        raise AssertionError("choice error must raise")
