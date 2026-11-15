import json
from pathlib import Path

import pytest


from scripts.delitzsch.review import dispositions
from scripts.delitzsch.review.workflow import (
    LexiconIndex,
    apply_decisions,
    iter_occurrences,
    load_latest_decisions,
    partition_reviewed_issues,
    scan_issues,
    summarize_reviewed_issues,
)


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def test_occurrence_identity_includes_verse(tmp_path):
    parsed = tmp_path / "data" / "delitzsch" / "parsed"
    write_json(
        parsed / "matthew" / "1.json",
        [
            {
                "chapter": 1,
                "verses": [
                    {
                        "chapter": 1,
                        "verse": 1,
                        "hebrew": "WORD ONE",
                        "words": [{"text": "אָדָם", "strong": None, "prefixes": []}],
                    },
                    {
                        "chapter": 1,
                        "verse": 2,
                        "hebrew": "WORD TWO",
                        "words": [{"text": "דָּוִד", "strong": "H1732", "prefixes": []}],
                    },
                ],
            }
        ],
    )

    occurrences = list(iter_occurrences(parsed, ["matthew"]))

    assert [item.key for item in occurrences] == ["matthew.1.1.0", "matthew.1.2.0"]
    assert occurrences[0].verse == 1
    assert occurrences[1].verse == 2


def test_apply_dry_run_does_not_modify_chapter_or_write_log(tmp_path):
    parsed = tmp_path / "data" / "delitzsch" / "parsed"
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    log_dir = tmp_path / "data" / "delitzsch" / "review" / "decisions"
    chapter_path = parsed / "matthew" / "1.json"
    write_json(
        chapter_path,
        [
            {
                "chapter": 1,
                "verses": [
                    {
                        "chapter": 1,
                        "verse": 1,
                        "hebrew": "WORD",
                        "words": [{"text": "אָדָם", "strong": None, "prefixes": []}],
                    }
                ],
            }
        ],
    )
    write_json(
        lexicon_dir / "H120.json",
        {"strong_number": "H120", "lemma": "אָדָם", "normalized": "אדמ", "definitions": []},
    )
    decisions_path = tmp_path / "batch.json"
    write_json(
        decisions_path,
        {
            "decisions": [
                {
                    "action": "set_strong",
                    "occurrence": {
                        "book": "matthew",
                        "chapter": 1,
                        "verse": 1,
                        "word_index": 0,
                        "text": "אָדָם",
                        "strong": None,
                    },
                    "previous_strong": None,
                    "new_strong": "H120",
                    "confidence": 1.0,
                    "reason": "test",
                    "evidence": ["test"],
                }
            ]
        },
    )

    before = chapter_path.read_text(encoding="utf-8")
    stats = apply_decisions(
        decisions_path,
        parsed,
        LexiconIndex(lexicon_dir),
        log_dir,
        dry_run=True,
    )

    assert stats.word_updates == 1
    assert stats.files_changed == 1
    assert chapter_path.read_text(encoding="utf-8") == before
    assert not log_dir.exists()


def test_apply_set_strong_updates_reviewed_word_metadata(tmp_path):
    parsed = tmp_path / "data" / "delitzsch" / "parsed"
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    log_dir = tmp_path / "data" / "delitzsch" / "review" / "decisions"
    chapter_path = parsed / "matthew" / "1.json"
    write_json(
        chapter_path,
        [
            {
                "chapter": 1,
                "verses": [
                    {
                        "chapter": 1,
                        "verse": 1,
                        "hebrew": "לָ/חֶם",
                        "words": [
                            {
                                "text": "לָחֶם",
                                "strong": "Hl/H3433",
                                "prefixes": ["Hl"],
                                "possible_proper_name": True,
                            }
                        ],
                    }
                ],
            }
        ],
    )
    write_json(
        lexicon_dir / "H3899.json",
        {"strong_number": "H3899", "lemma": "לֶחֶם", "definitions": []},
    )
    decisions_path = tmp_path / "batch.json"
    write_json(
        decisions_path,
        {
            "decisions": [
                {
                    "action": "set_strong",
                    "occurrence": {
                        "book": "matthew",
                        "chapter": 1,
                        "verse": 1,
                        "word_index": 0,
                        "text": "לָחֶם",
                        "strong": "Hl/H3433",
                    },
                    "previous_strong": "Hl/H3433",
                    "new_strong": "H3899",
                    "new_prefixes": [],
                    "new_possible_proper_name": False,
                }
            ]
        },
    )

    stats = apply_decisions(
        decisions_path,
        parsed,
        LexiconIndex(lexicon_dir),
        log_dir,
    )

    word = json.loads(chapter_path.read_text(encoding="utf-8"))[0]["verses"][0][
        "words"
    ][0]
    verse = json.loads(chapter_path.read_text(encoding="utf-8"))[0]["verses"][0]
    assert stats.word_updates == 1
    assert word == {
        "text": "לָחֶם",
        "strong": "H3899",
        "prefixes": [],
        "possible_proper_name": False,
    }
    assert verse["hebrew"] == "לָחֶם"


def test_apply_create_custom_entry_updates_word_and_custom_dictionary(tmp_path):
    parsed = tmp_path / "data" / "delitzsch" / "parsed"
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    custom_path = tmp_path / "data" / "dict" / "lexicon" / "custom_definitions.json"
    log_dir = tmp_path / "data" / "delitzsch" / "review" / "decisions"
    chapter_path = parsed / "acts" / "1.json"
    write_json(
        chapter_path,
        [
            {
                "chapter": 1,
                "verses": [
                    {
                        "chapter": 1,
                        "verse": 13,
                        "hebrew": "פֶּטְרוֹס",
                        "words": [{"text": "פֶּטְרוֹס", "strong": None, "prefixes": []}],
                    }
                ],
            }
        ],
    )
    write_json(custom_path, {})
    decisions_path = tmp_path / "batch.json"
    write_json(
        decisions_path,
        {
            "decisions": [
                {
                    "action": "create_custom_entry",
                    "custom_key": "D0001",
                    "occurrence": {
                        "book": "acts",
                        "chapter": 1,
                        "verse": 13,
                        "word_index": 0,
                        "text": "פֶּטְרוֹס",
                        "strong": None,
                    },
                    "previous_strong": None,
                    "definition": {
                        "text_en": "Peter",
                        "text_es": "Pedro",
                    },
                    "confidence": 0.9,
                    "reason": "Greek proper name in Delitzsch text",
                    "evidence": ["Acts 1:13"],
                }
            ]
        },
    )

    stats = apply_decisions(
        decisions_path,
        parsed,
        LexiconIndex(lexicon_dir),
        log_dir,
        dry_run=False,
    )

    updated_chapter = json.loads(chapter_path.read_text(encoding="utf-8"))
    custom = json.loads(custom_path.read_text(encoding="utf-8"))
    assert stats.word_updates == 1
    assert stats.definition_updates == 1
    assert updated_chapter[0]["verses"][0]["words"][0]["strong"] == "D0001"
    assert custom["D0001"]["definitions"][0]["text_en"] == "Peter"
    assert custom["D0001"]["nt_instances"][0]["book"] == "acts"
    assert custom["D0001"]["mapping_scope"] == "instances_only"


def test_apply_upsert_custom_definition_for_existing_strong(tmp_path):
    parsed = tmp_path / "data" / "delitzsch" / "parsed"
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    custom_path = tmp_path / "data" / "dict" / "lexicon" / "custom_definitions.json"
    log_dir = tmp_path / "data" / "delitzsch" / "review" / "decisions"
    write_json(
        lexicon_dir / "H3442.json",
        {
            "strong_number": "H3442",
            "lemma": "יֵשׁוּעַ",
            "normalized": "ישוע",
            "translit_en": "yeshua",
            "translit_es": "yeshua",
            "definitions": [],
        },
    )
    write_json(custom_path, {})
    decisions_path = tmp_path / "definitions.json"
    write_json(
        decisions_path,
        {
            "decisions": [
                {
                    "action": "upsert_custom_definition",
                    "strong": "H3442",
                    "definition": {
                        "text_en": "YHVH saves",
                        "text_es": "YHVH salva",
                    },
                    "confidence": 0.95,
                    "reason": "Name meaning review",
                    "evidence": ["custom review"],
                }
            ]
        },
    )

    stats = apply_decisions(
        decisions_path,
        parsed,
        LexiconIndex(lexicon_dir),
        log_dir,
        dry_run=False,
    )

    custom = json.loads(custom_path.read_text(encoding="utf-8"))
    assert stats.definition_updates == 1
    assert custom["H3442"]["hebrew"] == "יֵשׁוּעַ"
    assert custom["H3442"]["definitions"][0]["text_es"] == "YHVH salva"


def test_custom_entry_hebrew_is_available_as_normalized_lemma(tmp_path):
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    write_json(
        lexicon_dir.parent / "custom_definitions.json",
        {
            "D0001": {
                "strong_number": "D0001",
                "hebrew": "תְּאוֹפִילוֹס",
                "definitions": [{"text_en": "Theophilus"}],
            }
        },
    )

    lexicon = LexiconIndex(lexicon_dir)

    assert lexicon.normalized_lemma("D0001") == "תאופילוס"


def test_reviewed_manual_flags_are_not_remaining_issues(tmp_path):
    parsed = tmp_path / "data" / "delitzsch" / "parsed"
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    log_dir = tmp_path / "data" / "delitzsch" / "review" / "decisions"
    write_json(
        parsed / "acts" / "1.json",
        [
            {
                "chapter": 1,
                "verses": [
                    {
                        "chapter": 1,
                        "verse": 1,
                        "hebrew": "בּוֹ",
                        "words": [{"text": "בּוֹ", "strong": None, "prefixes": []}],
                    }
                ],
            }
        ],
    )
    log_dir.mkdir(parents=True)
    (log_dir / "acts.jsonl").write_text(
        json.dumps(
            {
                "status": "needs_manual_review",
                "action": "needs_manual_review",
                "occurrence": {
                    "book": "acts",
                    "chapter": 1,
                    "verse": 1,
                    "word_index": 0,
                    "text": "בּוֹ",
                },
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    issues = scan_issues(parsed, LexiconIndex(lexicon_dir))
    latest = load_latest_decisions(log_dir)
    remaining, reviewed = partition_reviewed_issues(issues, latest)

    assert remaining == []
    assert summarize_reviewed_issues(reviewed)["by_review_status"] == {
        "reviewed_manual": 1
    }


def test_john1_custom_grammar_entries_have_definitions():
    root = Path(__file__).resolve().parents[1]
    custom_path = root / "data" / "dict" / "lexicon" / "custom_definitions.json"
    custom = json.loads(custom_path.read_text(encoding="utf-8"))

    assert custom["D0208"]["definitions"][0]["text_en"]
    assert custom["D0208"]["definitions"][0]["text_es"]
    assert custom["D0209"]["definitions"][0]["text_en"]
    assert custom["D0209"]["definitions"][0]["text_es"]


def test_issue_119_grammar_policy_resolves_safe_null_forms():
    root = Path(__file__).resolve().parents[1]
    custom = json.loads(
        (root / "data" / "dict" / "lexicon" / "custom_definitions.json").read_text(
            encoding="utf-8"
        )
    )
    expected_instances = {
        "D0208": 293,
        "D0265": 204,
        "D0266": 545,
        "D0267": 2,
        "D0268": 1,
        "D0269": 1,
        "D0270": 1,
        "D0271": 81,
    }
    for key, instance_count in expected_instances.items():
        assert custom[key]["definitions"][0]["text_en"]
        assert custom[key]["definitions"][0]["text_es"]
        assert len(custom[key]["nt_instances"]) == instance_count

    for key in ("D0265", "D0266", "D0267", "D0268", "D0269", "D0270", "D0271"):
        assert custom[key]["mapping_scope"] == "exact"

    issues = scan_issues(
        root / "data" / "delitzsch" / "parsed",
        LexiconIndex(root / "data" / "dict" / "lexicon" / "words"),
    )
    nulls = [issue.occurrence.text for issue in issues if issue.issue_type == "null_strong"]
    custom_warnings = [
        issue
        for issue in issues
        if issue.issue_type == "suspicious_strong"
        and (issue.current_strong or "").split("/")[-1].startswith("D")
    ]

    assert nulls == []  # #43 resolves בוכיות and removes non-Hebrew WO placeholders
    assert custom_warnings == []


def test_issue_119_proper_name_review_has_no_remaining_scan_flags():
    root = Path(__file__).resolve().parents[1]
    parsed = root / "data" / "delitzsch" / "parsed"
    lexicon = LexiconIndex(root / "data" / "dict" / "lexicon" / "words")
    log_dir = root / "data" / "delitzsch" / "review" / "decisions"

    issues = scan_issues(parsed, lexicon)
    remaining, reviewed = partition_reviewed_issues(
        issues, load_latest_decisions(log_dir)
    )

    assert remaining == []
    assert summarize_reviewed_issues(reviewed)["by_review_status"] == {}
    assert all(issue.issue_type == "null_strong" for issue in issues)


def test_issue_119_false_name_assignments_use_contextual_lexemes():
    root = Path(__file__).resolve().parents[1]

    def word(book, chapter, verse_number, word_index):
        chapter_data = json.loads(
            (root / "data" / "delitzsch" / "parsed" / book / f"{chapter}.json").read_text(
                encoding="utf-8"
            )
        )[0]
        verse = next(
            item for item in chapter_data["verses"] if item["verse"] == verse_number
        )
        return verse["words"][word_index]

    assert word("acts", 8, 30, 5)["strong"] == "H7121"
    assert word("acts", 10, 10, 4) == {
        "text": "לָחֶם",
        "strong": "H3899",
        "prefixes": [],
        "possible_proper_name": False,
    }
    assert word("james", 1, 6, 6)["strong"] == "H1167"
    assert word("john1", 2, 7, 15)["strong"] == "Hd/H3465"
    assert word("mark", 9, 39, 10)["strong"] == "Hc/H3201"
    assert word("matthew", 5, 13, 1)["strong"] == "H4417"
    assert word("revelation", 2, 17, 18)["strong"] == "H3836"


def test_issue_119_genuine_name_entries_have_definitions():
    root = Path(__file__).resolve().parents[1]
    lexicon = LexiconIndex(root / "data" / "dict" / "lexicon" / "words")

    for strong in ("H3110", "H3141", "H3568", "H4023", "H4287", "H7410", "H8012"):
        entry = lexicon.get(strong)
        assert entry
        assert entry["definitions"][0]["text_en"]
        assert entry["definitions"][0]["text_es"]


def test_john1_has_no_null_strongs_after_custom_grammar_pass():
    root = Path(__file__).resolve().parents[1]
    parsed_dir = root / "data" / "delitzsch" / "parsed" / "john1"
    nulls = []

    for chapter_path in sorted(parsed_dir.glob("*.json"), key=lambda path: int(path.stem)):
        chapter_data = json.loads(chapter_path.read_text(encoding="utf-8"))
        chapter = chapter_data[0]
        for verse in chapter["verses"]:
            for word_index, word in enumerate(verse["words"]):
                if word.get("strong") is None:
                    nulls.append(
                        (
                            chapter["chapter"],
                            verse["verse"],
                            word_index,
                            word.get("text"),
                        )
                    )

    assert nulls == []


def test_targeted_proper_names_use_custom_definitions():
    root = Path(__file__).resolve().parents[1]
    custom_path = root / "data" / "dict" / "lexicon" / "custom_definitions.json"
    custom = json.loads(custom_path.read_text(encoding="utf-8"))

    john3 = json.loads(
        (root / "data" / "delitzsch" / "parsed" / "john3" / "1.json").read_text(
            encoding="utf-8"
        )
    )
    ephesians = json.loads(
        (root / "data" / "delitzsch" / "parsed" / "ephesians" / "1.json").read_text(
            encoding="utf-8"
        )
    )

    assert john3[0]["verses"][0]["words"][2]["text"] == "גָּיוֹס"
    assert john3[0]["verses"][0]["words"][2]["strong"] == "D0057"
    assert ephesians[0]["verses"][0]["words"][0]["text"] == "פּוֹלוֹס"
    assert ephesians[0]["verses"][0]["words"][0]["strong"] == "D0024"

    assert custom["D0057"]["definitions"][0]["text_en"]
    assert custom["D0057"]["definitions"][0]["text_es"]
    assert custom["D0024"]["definitions"][0]["text_en"]
    assert custom["D0024"]["definitions"][0]["text_es"]


def queue_entry(location, reasons, prior=None):
    return {"location": location, "text": "בָּחַר", "strong": "H977", "reasons": reasons,
            "prior_review_status": prior, "evidence": "heuristic only"}


def no_lemma(strong):
    return None


def test_disposition_ledger_records_prior_reviews_and_leaves_the_rest_unresolved():
    queue = [
        queue_entry("acts.1.2.12", ["prefix_metadata_disagreement"], prior="applied"),
        queue_entry("acts.1.2.13", ["lexical_plausibility"]),
        queue_entry("acts.1.2.14", ["prefix_metadata_disagreement", "lexical_plausibility"]),
    ]
    decision = {"status": "applied", "action": "set_strong", "reviewer": "codex-desktop", "new_strong": "H977"}
    first = dispositions.build_ledger(queue, {"acts.1.2.12": decision, "acts.9.9.9": decision}, no_lemma)

    assert first["schema_version"] == dispositions.SCHEMA_VERSION
    assert [(r["family"], r["disposition"], r["rule"], r["reviewer"]) for r in first["records"]] == [
        ("prefix_metadata", "already_reviewed", "prior_review_decision", "codex-desktop"),
        ("lexical_plausibility", "unresolved", "unadjudicated", None),
        ("prefix_metadata_and_lexical", "unresolved", "unadjudicated", None),
    ]
    assert all(r["disposition"] in first["dispositions"] and r["rule_version"] == 1 for r in first["records"])
    assert first["records"][0]["evidence"]["prior_decision"]["new_strong"] == "H977"
    assert first["records"][0]["before"] == {"text": "בָּחַר", "strong": "H977"}
    assert first["summary"]["by_disposition"]["unresolved"] == 2
    assert first["summary"]["by_family"]["prefix_metadata"]["already_reviewed"] == 1
    assert dispositions.serialize(first) == dispositions.serialize(dispositions.build_ledger(queue, {"acts.1.2.12": decision}, no_lemma))


def test_disposition_ledger_rejects_a_prior_review_without_its_decision():
    with pytest.raises(ValueError, match="no decision log entry"):
        dispositions.build_ledger([queue_entry("acts.1.2.12", ["lexical_plausibility"], prior="skipped")], {}, no_lemma)


def test_committed_disposition_ledger_is_current_and_rerun_is_byte_identical():
    rebuilt = dispositions.build_from_disk()
    assert dispositions.serialize(rebuilt) == dispositions.serialize(dispositions.build_from_disk())
    committed = dispositions.read_ledger()
    assert committed == rebuilt
    summary = committed["summary"]
    assert summary["total"] == 11528
    assert summary["by_disposition"]["corrected"] == 70
    assert summary["by_disposition"]["already_reviewed"] == 718 - 70


def ledger_record(location):
    return next(r for r in dispositions.read_ledger()["records"] if r["location"] == location)


def parsed_verse(book, chapter, verse):
    payload = json.loads((dispositions.ROOT / "data/delitzsch/parsed" / book / f"{chapter}.json").read_text(encoding="utf-8"))
    return next(v for v in (payload[0] if isinstance(payload, list) else payload)["verses"] if v["verse"] == verse)


def test_root_letter_prefixes_are_corrected_in_the_ledger_and_the_verse():
    chose = ledger_record("acts.1.2.12")
    assert (chose["disposition"], chose["rule"], chose["reviewer"]) == ("corrected", "root_letter_prefix", "rule:root_letter_prefix_v1")
    assert chose["before"] == {"text": "בָּחַר", "strong": "H977", "prefixes": ["Hb"]}
    assert chose["after"] == {"text": "בָּחַר", "strong": "H977", "prefixes": []}
    assert (chose["evidence"]["consonants"], chose["evidence"]["lemma"]) == ("בחר", "בחר")
    assert chose["evidence"]["strong_review"]["new_strong"] == "H977"
    verse = parsed_verse("acts", 1, 2)
    assert verse["words"][12]["prefixes"] == []
    assert "אֲשֶׁר־בָּחַר בָּ/הֶם" in verse["hebrew"]

    bread = ledger_record("acts.11.3.8")
    assert (bread["disposition"], bread["before"]["prefixes"], bread["after"]["prefixes"]) == ("corrected", ["Hl"], [])
    young_men = ledger_record("acts.2.17.14")
    assert (young_men["before"]["prefixes"], young_men["after"]["prefixes"]) == (["Hc", "Hb"], ["Hc"])
    assert "וּ/בַחוּרֵיכֶם" in parsed_verse("acts", 2, 17)["hebrew"]


def test_plausible_prefix_readings_stay_unresolved():
    for location in ("luke.18.29.5", "matthew.6.24.26", "matthew.2.2.7"):
        assert ledger_record(location)["disposition"] == "unresolved"


def test_root_letter_rule_needs_a_reviewed_strong_and_a_false_prefix():
    entry = {"location": "acts.1.2.12", "strong": "H977", "reasons": ["prefix_metadata_disagreement"]}
    reviewed = {"status": "applied", "new_strong": "H977", "reviewer": "codex-desktop", "reason": "choose", "logged_at": "t"}
    word = {"text": "בָּחַר", "prefixes": ["Hb"]}
    proposal = dispositions.root_letter_decision(entry, word, reviewed, "בחר")
    assert (proposal["new_strong"], proposal["new_prefixes"], proposal["occurrence"]["prefixes"]) == ("H977", [], ["Hb"])
    assert dispositions.root_letter_decision(entry, word, None, "בחר") is None
    assert dispositions.root_letter_decision(entry, word, dict(reviewed, status="needs_manual_review"), "בחר") is None
    confidence = {"text": "בְּבִטְחוֹן", "prefixes": ["Hb"]}
    assert dispositions.root_letter_decision(dict(entry, strong="H986"), confidence, dict(reviewed, new_strong="H986"), "בטחונ") is None


def test_committed_root_letter_batch_matches_its_generator():
    committed = json.loads(dispositions.ROOT_LETTER_BATCH.read_text(encoding="utf-8"))
    assert committed == dispositions.root_letter_batch_from_disk()
    assert len(committed["decisions"]) == 70


def test_reverting_ledger_corrections_restores_the_validated_remediation_corpus():
    import gzip
    from scripts.delitzsch.review.remediate import digest, load_corpus
    plan = json.loads(gzip.decompress(dispositions.REPORT.read_bytes()))
    records = dispositions.read_ledger()["records"]
    corpus = load_corpus()
    assert digest(dispositions.revert_corrections(corpus, records)) == plan["corpus_after_sha256"]
    stale = [dict(r, after=dict(r["after"], prefixes=["Hb"])) for r in records if r["location"] == "acts.1.10.8"]
    with pytest.raises(ValueError, match="corpus prefixes differ"):
        dispositions.revert_corrections(corpus, stale)


def corpus_with_acts_1_2(hebrew):
    from scripts.delitzsch.review.remediate import load_corpus
    corpus = load_corpus()
    payload = corpus["acts/1.json"]
    verse = next(v for v in (payload[0] if isinstance(payload, list) else payload)["verses"] if v["verse"] == 2)
    assert verse["hebrew"] != hebrew(verse["hebrew"])
    verse["hebrew"] = hebrew(verse["hebrew"])
    return corpus


@pytest.mark.parametrize("hebrew", [
    lambda text: text.replace("בָּ/הֶם", "בָּהֶם"),
    lambda text: text.replace("עַד", "ע/ַד", 1),
])
def test_reverting_rejects_a_separator_change_on_another_word_of_a_corrected_verse(hebrew):
    records = dispositions.read_ledger()["records"]
    with pytest.raises(ValueError, match="separators differ"):
        dispositions.revert_corrections(corpus_with_acts_1_2(hebrew), records)


def test_rerunning_the_remediation_apply_after_ledger_corrections_changes_nothing(tmp_path):
    import gzip
    import shutil
    from scripts.delitzsch.review.remediate import PARSED, apply_plan
    plan = json.loads(gzip.decompress(dispositions.REPORT.read_bytes()))
    records = dispositions.read_ledger()["records"]
    shutil.copytree(PARSED, tmp_path, dirs_exist_ok=True)
    before = {path: (tmp_path / path).read_bytes() for path in plan["files"]}
    assert apply_plan(plan, tmp_path, revert=lambda path, payload: dispositions.revert_file(path, payload, records)) == 0
    assert {path: (tmp_path / path).read_bytes() for path in plan["files"]} == before
    (tmp_path / "acts/1.json").write_text((tmp_path / "acts/1.json").read_text(encoding="utf-8").replace("בָּ/הֶם", "בָּהֶם"), encoding="utf-8")
    with pytest.raises(ValueError, match="separators differ"):
        apply_plan(plan, tmp_path, revert=lambda path, payload: dispositions.revert_file(path, payload, records))


def root_letter_tagged(location, text, strong, prefixes, new_prefixes, prior_strong):
    book, chapter, verse, index = location.split(".")
    return dict(
        status="applied", action="set_strong", issue_type=dispositions.ROOT_LETTER_ISSUE, reviewer="rule:root_letter_prefix_v1",
        occurrence=dict(book=book, chapter=int(chapter), verse=int(verse), word_index=int(index), text=text, strong=strong, prefixes=prefixes),
        previous_strong=strong, new_strong=strong, new_prefixes=new_prefixes, logged_at="t",
        evidence=dict(strong_review=dict(status="applied", new_strong=prior_strong)),
    )


def test_ledger_rejects_a_root_letter_decision_the_rule_does_not_support():
    lemmas = {"H977": "בחר", "H3922": "לכה"}.get
    chose = dict(queue_entry("acts.1.2.12", ["prefix_metadata_disagreement"], prior="applied"))
    valid = root_letter_tagged("acts.1.2.12", "בָּחַר", "H977", ["Hb"], [], "H977")
    assert dispositions.build_ledger([chose], {"acts.1.2.12": valid}, lemmas)["records"][0]["disposition"] == "corrected"
    you = dict(queue_entry("luke.18.29.5", ["prefix_metadata_disagreement"]), text="לָכֶם", strong="H3922")
    mistagged = root_letter_tagged("luke.18.29.5", "לָכֶם", "H3922", ["Hl"], [], None)
    for entry, decision in (
        (you, mistagged),
        (chose, dict(valid, new_prefixes=["Hb"])),
        (chose, dict(valid, evidence=dict(strong_review=dict(status="applied", new_strong="H970")))),
        (dict(chose, prior_review_status=None), valid),
    ):
        with pytest.raises(ValueError, match="does not satisfy the root-letter rule"):
            dispositions.build_ledger([entry], {entry["location"]: decision}, lemmas)
