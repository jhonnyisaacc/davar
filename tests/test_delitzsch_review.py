import json
from collections import Counter
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


def test_disposition_ledger_records_prior_reviews_and_leaves_the_rest_unresolved():
    queue = [
        queue_entry("acts.1.2.12", ["prefix_metadata_disagreement"], prior="applied"),
        queue_entry("acts.1.2.13", ["lexical_plausibility"]),
        queue_entry("acts.1.2.14", ["prefix_metadata_disagreement", "lexical_plausibility"]),
    ]
    decision = {"status": "applied", "action": "set_strong", "reviewer": "codex-desktop", "new_strong": "H977"}
    first = dispositions.build_ledger(queue, {"acts.1.2.12": decision, "acts.9.9.9": decision})

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
    assert dispositions.serialize(first) == dispositions.serialize(dispositions.build_ledger(queue, {"acts.1.2.12": decision}))


def test_disposition_ledger_rejects_a_prior_review_without_its_decision():
    with pytest.raises(ValueError, match="no decision log entry"):
        dispositions.build_ledger([queue_entry("acts.1.2.12", ["lexical_plausibility"], prior="skipped")], {})


def test_committed_disposition_ledger_is_current_and_rerun_is_byte_identical():
    rebuilt = dispositions.build_from_disk()
    assert dispositions.serialize(rebuilt) == dispositions.serialize(dispositions.build_from_disk())
    committed = dispositions.read_ledger()
    assert committed == rebuilt
    summary = committed["summary"]
    assert summary["total"] == 11528 + 16084 + 1 + 1657
    assert summary["by_family"]["prefix_metadata"] == {
        "benign": 1480, "corrected": 71, "already_reviewed": 374, "unresolved": 3569, "blocked": 0, "superseded": 0,
    }
    assert summary["by_family"]["outside_queue"] == {
        "benign": 0, "corrected": 1658, "already_reviewed": 0, "unresolved": 0, "blocked": 0, "superseded": 0,
    }
    assert summary["benign_lexical_review"] == {"pending": 1230, "reviewed": 250}
    assert summary["by_family"]["legacy_assignment"] == {
        "benign": 0, "corrected": 0, "already_reviewed": 0, "unresolved": 0, "blocked": 7249, "superseded": 8835,
    }
    assert {rule: summary["by_rule"][rule] for rule in ("legacy_without_candidate", "legacy_current_value", "legacy_blocked")} == {
        "legacy_without_candidate": 4360, "legacy_current_value": 4475, "legacy_blocked": 7249,
    }


def legacy_record(row):
    record = next(r for r in dispositions.read_ledger()["records"] if r.get("row") == row)
    assert (record["source"], record["location"]) == ("legacy_assignment_review", None)
    return record


def test_legacy_rows_without_a_candidate_are_superseded():
    theophilus = legacy_record(0)
    assert (theophilus["disposition"], theophilus["rule"], theophilus["after"]) == ("superseded", "legacy_without_candidate", None)
    assert theophilus["before"] == {"book": "acts", "chapter": 1, "word_index": 3, "text": "תְּאוֹפִילוֹס", "candidate": None, "outcome": "failed"}
    placeholder = legacy_record(7324)
    assert (placeholder["before"]["text"], placeholder["disposition"]) == ("WO", "superseded")


def test_legacy_row_matching_the_current_value_at_its_one_location_is_superseded_by_it():
    baptized = legacy_record(5)
    assert (baptized["disposition"], baptized["rule"], baptized["reviewer"]) == ("superseded", "legacy_current_value", "rule:legacy_current_value_v1")
    assert baptized["after"] == {"location": "acts.1.5.5", "strong": "H2881"}
    assert baptized["evidence"]["current"] == [{"location": "acts.1.5.5", "text": "תִּטָּבְלוּ", "strong": "H2881", "review_status": "applied"}]
    assert parsed_verse("acts", 1, 5)["words"][5]["strong"] == "H2881"


def test_other_legacy_rows_are_blocked_with_their_matching_locations_and_nothing_is_reapplied():
    command = legacy_record(2)
    assert (command["disposition"], command["rule"], command["after"]) == ("blocked", "legacy_blocked", None)
    assert command["before"]["candidate"] == "H6702"
    assert command["evidence"]["current"] == [{"location": "acts.1.2.6", "text": "צַוֹּתוֹ", "strong": "H6680", "review_status": "applied"}]
    assert parsed_verse("acts", 1, 2)["words"][6]["strong"] == "H6680"
    need = legacy_record(27)
    assert (need["disposition"], need["evidence"]["matching_locations"]) == ("blocked", ["acts.1.16.3", "acts.1.21.3"])
    assert [m["strong"] for m in need["evidence"]["current"]] == ["H8293", "H8293"]


def test_legacy_row_is_blocked_when_its_location_has_another_word_or_several_matches():
    row = dict(book="acts", chapter=1, word_index=5, text="תִּטָּבְלוּ", candidate="H2881", outcome="strong",
               matching_locations=["acts.1.5.5"], reason="lost identity")
    same = dispositions.Match("acts.1.5.5", {"text": "תִּטָּבְלוּ", "strong": "H2881"}, None)
    other = dispositions.Match("acts.1.5.5", {"text": "וַתִּטָּבְלוּ", "strong": "H2881"}, None)

    def rule(matches):
        return dispositions.build_ledger([], {}, {}, [row], [matches])["records"][0]["rule"]

    assert rule([same]) == "legacy_current_value"
    assert rule([other]) == rule([same, same]) == rule([]) == "legacy_blocked"
    assert dispositions.build_ledger([], {}, {}, [dict(row, candidate=None)], [[]])["records"][0]["rule"] == "legacy_without_candidate"


def test_style_only_prefixes_are_benign_with_lemma_evidence():
    samaria = ledger_record("acts.1.8.12")
    assert (samaria["disposition"], samaria["rule"], samaria["rule_version"]) == ("benign", "style_only_prefix", 5)
    assert samaria["before"] == {"text": "וּבְשֹׁמְרוֹן", "strong": "H8111"}
    assert samaria["after"] is None
    evidence = samaria["evidence"]
    assert (evidence["consonants"], evidence["prefix_letters"], evidence["lemma"]) == ("ובשמרונ", "וב", "שמרון")
    assert evidence["prefixes"] == ["Hc", "Hb"]
    assert evidence["prior_decision"]["new_strong"] == "H8111"
    assert samaria["lexical_review"] == "reviewed"
    assert ledger_record("luke.6.21.6")["disposition"] == "benign"
    assert ledger_record("acts.1.2.12")["disposition"] == "corrected"


def test_benign_prefix_without_a_reviewed_strong_stays_pending_lexical_review():
    matthew = ledger_record("acts.1.13.17")
    assert (matthew["disposition"], matthew["before"]) == ("benign", {"text": "וּמַתַּי", "strong": "H4970"})
    assert matthew["evidence"]["prior_decision"] is None
    assert matthew["lexical_review"] == "pending"
    assert "lexical_review" not in ledger_record("acts.1.2.12")


def test_style_only_rule_leaves_unsettled_prefix_flags_alone():
    assert ledger_record("acts.13.15.14")["disposition"] == "unresolved"
    assert ledger_record("acts.7.58.6")["disposition"] == "unresolved"
    assert ledger_record("corinthians1.1.4.9")["disposition"] == "already_reviewed"
    entry = queue_entry("acts.1.2.12", ["prefix_metadata_disagreement"])
    readings = {"acts.1.2.12": dispositions.Reading(["Hb"], "בחר")}
    [record] = dispositions.build_ledger([entry], {}, readings)["records"]
    assert (record["disposition"], record["rule"]) == ("unresolved", "unadjudicated")
    readings = {"acts.1.2.12": dispositions.Reading([], "בחר")}
    [record] = dispositions.build_ledger([dict(entry, text="בְּבָחַר")], {}, readings)["records"]
    assert record["disposition"] == "unresolved"


def test_style_only_rule_does_not_settle_a_prefix_flag_with_no_prefixes():
    entry = queue_entry("acts.1.2.12", ["prefix_metadata_disagreement"])
    readings = {"acts.1.2.12": dispositions.Reading([], "בחר")}
    [record] = dispositions.build_ledger([entry], {}, readings)["records"]
    assert (record["disposition"], record["rule"]) == ("unresolved", "unadjudicated")


def test_style_only_rule_does_not_settle_a_prefix_letter_another_lemma_reads_as_root():
    confidence = ledger_record("acts.28.31.11")
    assert (confidence["disposition"], confidence["before"]) == ("unresolved", {"text": "בִּטְחוֹן", "strong": "H2911"})
    assert ledger_record("corinthians2.10.8.12")["disposition"] == "unresolved"
    assert ledger_record("luke.8.30.7")["disposition"] == "unresolved"
    entry = dict(queue_entry("acts.28.31.11", ["prefix_metadata_disagreement"]), text="בִּטְחוֹן", strong="H2911")
    reviewed = {"status": "applied", "new_strong": "H2911", "reviewer": "r", "reason": "x", "logged_at": "t"}
    readings = {"acts.28.31.11": dispositions.Reading(["Hb"], "טחון", False, True)}
    [pending] = dispositions.build_ledger([entry], {}, readings)["records"]
    [confirmed] = dispositions.build_ledger([dict(entry, prior_review_status="applied")], {"acts.28.31.11": reviewed}, readings)["records"]
    assert (pending["disposition"], confirmed["disposition"], confirmed["lexical_review"]) == ("unresolved", "benign", "reviewed")


def test_style_only_rule_does_not_settle_a_prefix_an_equal_length_lemma_reads_as_root():
    without = ledger_record("hebrews.11.40.4")
    assert (without["disposition"], without["before"]) == ("unresolved", {"text": "בִּלְעָדֵינוּ", "strong": "H5722"})
    assert dispositions.reads_prefix_as_root("בלעדינו", 2, "עדינו", frozenset({"בלעדי"}))
    assert not dispositions.reads_prefix_as_root("כדברו", 1, "דבר", frozenset({"כדב"}))
    assert ledger_record("acts.1.13.17")["disposition"] == ledger_record("acts.1.8.12")["disposition"] == "benign"


def test_style_only_rule_does_not_read_a_verb_stem_he_as_the_article():
    assert ledger_record("acts.6.6.2")["before"]["text"] == "הֶעֱמִידוּ"
    assert ledger_record("acts.6.6.2")["disposition"] == "unresolved"
    assert ledger_record("romans.15.30.11")["disposition"] == "unresolved"
    raise_up = ledger_record("acts.12.4.14")
    assert (raise_up["before"]["text"], raise_up["disposition"], raise_up["rule"]) == ("לְהַעֲלוֹתוֹ", "already_reviewed", "prior_review_decision")
    assert ledger_record("luke.6.21.6")["before"]["text"] == "הַבֹּכִים"

    def disposition(text, prefixes, lemma, is_root=False):
        entry = dict(queue_entry("acts.1.1.1", ["prefix_metadata_disagreement"]), text=text)
        readings = {"acts.1.1.1": dispositions.Reading(prefixes, lemma, is_root)}
        return dispositions.build_ledger([entry], {}, readings)["records"][0]["disposition"]

    assert disposition("הַתַּלְמִידִים", ["Hd"], "תלמיד") == "benign"
    assert disposition("הָעִבְרִיִּים", ["Hd"], "עברי") == "benign"
    assert disposition("לְהַתַּלְמִידִים", ["Hl", "Hd"], "תלמיד") == "unresolved"
    assert disposition("הַעֲמִיד", ["Hd"], "עמד", is_root=True) == "unresolved"
    assert disposition("הִשְׁלִיכוּ", ["Hd"], "שלך", is_root=True) == "unresolved"


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
    readings = {"acts.1.2.12": dispositions.Reading([], "בחר"), "luke.18.29.5": dispositions.Reading(["Hl"], "לכה")}
    chose = dict(queue_entry("acts.1.2.12", ["prefix_metadata_disagreement"], prior="applied"))
    valid = root_letter_tagged("acts.1.2.12", "בָּחַר", "H977", ["Hb"], [], "H977")
    assert dispositions.build_ledger([chose], {"acts.1.2.12": valid}, readings)["records"][0]["disposition"] == "corrected"
    you = dict(queue_entry("luke.18.29.5", ["prefix_metadata_disagreement"]), text="לָכֶם", strong="H3922")
    mistagged = root_letter_tagged("luke.18.29.5", "לָכֶם", "H3922", ["Hl"], [], None)
    for entry, decision in (
        (you, mistagged),
        (chose, dict(valid, new_prefixes=["Hb"])),
        (chose, dict(valid, evidence=dict(strong_review=dict(status="applied", new_strong="H970")))),
        (dict(chose, prior_review_status=None), valid),
    ):
        with pytest.raises(ValueError, match="does not satisfy the root-letter rule"):
            dispositions.build_ledger([entry], {entry["location"]: decision}, readings)


def test_issue_379_strong_corrections_are_recorded_with_before_and_after_evidence():
    creation = ledger_record("mark.13.19.11")
    assert (creation["source"], creation["family"], creation["disposition"], creation["rule"]) == (
        "decision_log", "outside_queue", "corrected", "reviewed_strong_correction")
    assert creation["before"] == {"text": "הַבְּרִיאָה", "strong": "Hd/H1277", "prefixes": ["Hd"]}
    assert creation["after"] == {"text": "הַבְּרִיאָה", "strong": "Hd/H1278", "prefixes": ["Hd"]}
    assert all(creation["evidence"][key] for key in ("lexicon", "grammar", "context", "reason"))
    bride = ledger_record("revelation.21.2.12")
    assert (bride["source"], bride["family"], bride["disposition"]) == ("review_queue", "prefix_metadata", "corrected")
    assert (bride["before"]["strong"], bride["after"]["strong"]) == ("H5369", "Hk/H3618")
    assert parsed_verse("mark", 13, 19)["words"][11]["strong"] == "Hd/H1278"
    assert parsed_verse("revelation", 21, 2)["words"][12]["strong"] == "Hk/H3618"


def strong_corrected(location, text, strong, prefixes, new_strong):
    book, chapter, verse, index = location.split(".")
    return dict(
        status="applied", action="set_strong", issue_type=dispositions.STRONG_ISSUE, reviewer="claude-delitzsch-review",
        occurrence=dict(book=book, chapter=int(chapter), verse=int(verse), word_index=int(index), text=text, strong=strong, prefixes=prefixes),
        previous_strong=strong, new_strong=new_strong, reason="creation", logged_at="t",
        evidence=dict(lexicon="H1278", grammar="article", context="creation"),
    )


def test_ledger_records_a_reviewed_strong_correction_outside_the_queue_and_rejects_unsupported_ones():
    valid = strong_corrected("mark.13.19.11", "הַבְּרִיאָה", "Hd/H1277", ["Hd"], "Hd/H1278")
    [record] = dispositions.build_ledger([], {"mark.13.19.11": valid})["records"]
    assert (record["source"], record["family"], record["disposition"], record["after"]["strong"]) == (
        "decision_log", "outside_queue", "corrected", "Hd/H1278")
    assert dispositions.build_ledger([], {"mark.13.19.11": dict(valid, issue_type="definition_review")})["records"] == []
    evidence = valid["evidence"]
    for decision in (
        dict(valid, status="needs_manual_review"),
        dict(valid, reviewer="rule:anything_v1"),
        dict(valid, new_strong="H1278"),
        dict(valid, new_strong="Hd/H1277"),
        dict(valid, previous_strong="Hd/H1279"),
        dict(valid, new_prefixes=[]),
        dict(valid, evidence={key: value for key, value in evidence.items() if key != "context"}),
    ):
        with pytest.raises(ValueError, match="does not satisfy the reviewed Strong correction rule"):
            dispositions.build_ledger([], {"mark.13.19.11": decision})


def mark_13_19_words(corpus):
    payload = corpus["mark/13.json"]
    return next(v for v in (payload[0] if isinstance(payload, list) else payload)["verses"] if v["verse"] == 19)["words"]


def test_reverting_restores_corrected_strongs_and_any_other_strong_edit_still_fails():
    import gzip
    from scripts.delitzsch.review.remediate import digest, load_corpus
    plan = json.loads(gzip.decompress(dispositions.REPORT.read_bytes()))
    records = dispositions.read_ledger()["records"]
    reverted = dispositions.revert_corrections(load_corpus(), records)
    assert digest(reverted) == plan["corpus_after_sha256"]
    assert mark_13_19_words(reverted)[11]["strong"] == "Hd/H1277"

    def edited(index, strong):
        corpus = load_corpus()
        mark_13_19_words(corpus)[index]["strong"] = strong
        return corpus

    with pytest.raises(ValueError, match="corpus Strong differs"):
        dispositions.revert_corrections(edited(11, "Hd/H1279"), records)
    assert digest(dispositions.revert_corrections(edited(12, "H1"), records)) != plan["corpus_after_sha256"]


def test_committed_outside_queue_root_letter_batch_matches_its_generator():
    committed = json.loads(dispositions.OUTSIDE_ROOT_LETTER_BATCH.read_text(encoding="utf-8"))
    assert committed == dispositions.outside_root_letter_batch_from_disk()
    assert len(committed["decisions"]) == 1657
    assert Counter(item["reason"] for item in committed["unresolved"]) == {
        "prefix_reading": 869, "short_lemma": 838, "lemma_not_in_word": 644, "article_shape": 7, "manual_review": 3,
    }


def test_false_prefixes_outside_the_queue_leave_the_prefixes_and_the_strong_string():
    chose = ledger_record("acts.1.24.15")
    assert (chose["source"], chose["family"], chose["disposition"], chose["rule"]) == (
        "decision_log", "outside_queue", "corrected", "root_letter_prefix_outside_queue")
    assert chose["before"] == {"text": "בָּחַרְתָּ", "strong": "Hb/H977", "prefixes": ["Hb"]}
    assert chose["after"] == {"text": "בָּחַרְתָּ", "strong": "H977", "prefixes": []}
    assert (chose["evidence"]["basis"], chose["evidence"]["lemma"], chose["evidence"]["strong_review"]["status"]) == ("reviewed_strong", "בחר", "skipped")
    assert "אֲשֶׁר־בָּחַרְתָּ" in parsed_verse("acts", 1, 24)["hebrew"]

    night = ledger_record("acts.12.6.1")
    assert (night["before"]["strong"], night["after"]["strong"], night["after"]["prefixes"]) == ("Hb/Hl/H3915", "Hb/H3915", ["Hb"])
    assert night["evidence"]["basis"] == "lemma_check"
    assert "בַּ/לַּיְלָה" in parsed_verse("acts", 12, 6)["hebrew"]


def test_plausible_prefixes_outside_the_queue_stay_as_tagged():
    unresolved = {item["location"]: item["reason"] for item in json.loads(dispositions.OUTSIDE_ROOT_LETTER_BATCH.read_text(encoding="utf-8"))["unresolved"]}
    for location, reason, book, chapter, verse, index, strong in (
        ("revelation.14.10.14", "prefix_reading", "revelation", 14, 10, 14, "Hb/H888"),
        ("corinthians1.7.31.0", "article_shape", "corinthians1", 7, 31, 0, "Hc/Hd/H2008"),
        ("acts.6.1.18", "manual_review", "acts", 6, 1, 18, "Hl/H3861"),
        ("acts.10.2.6", "short_lemma", "acts", 10, 2, 6, "Hb/H1121"),
        ("ephesians.1.5.2", "prefix_reading", "ephesians", 1, 5, 2, "Hl/Hb/H3836"),
    ):
        assert unresolved[location] == reason
        assert parsed_verse(book, chapter, verse)["words"][index]["strong"] == strong


@pytest.mark.parametrize("text, prefixes, strong, lemma, review, expected", [
    ("בָּחַרְתָּ", ["Hb"], "Hb/H977", "בחר", {"status": "skipped", "new_strong": "Hb/H977"}, ([], "reviewed_strong", True)),
    ("בָּחַרְתָּ", ["Hb"], "Hb/H977", "בחר", None, ([], "prefix_reading", False)),
    ("הֲמוֹן", ["Hd"], "Hd/H1995", "המונ", None, ([], "lemma_check", True)),
    ("בְּאֵשׁ", ["Hb"], "Hb/H888", "באש", None, ([], "prefix_reading", False)),
    ("לָהֶן", ["Hl"], "Hl/H3861", "להנ", None, ([], "prefix_reading", False)),
    ("בְּנֵי", ["Hb"], "Hb/H1121", "בנ", None, ([], "short_lemma", False)),
    ("בְּשׂוֹרַת", ["Hb"], "Hb/H1309", "בשורה", None, ([], "lemma_not_in_word", False)),
    ("וְהַנֶּהֱנִים", ["Hc", "Hd"], "Hc/Hd/H2008", "הנה", None, (["Hc"], "article_shape", False)),
    ("לָבוֹא", ["Hl", "Hb"], "Hl/Hb/H935", "בוא", {"status": "needs_manual_review", "new_strong": "Hl/Hb/H935"}, (["Hl"], "manual_review", False)),
    ("לְבֵית", ["Hl"], "Hl/H1004", "בית", None, None),
    ("לְבָנִים", ["Hl", "Hb"], "Hl/Hb/H3836", "לבנ", None, ([], "prefix_reading", False)),
    ("לְבוּשׁוֹ", ["Hl", "Hb"], "Hl/Hb/H3830", "לבוש", None, ([], "lemma_check", True)),
])
def test_outside_root_letter_is_certain_only_for_a_reviewed_strong_or_an_unambiguous_lemma(text, prefixes, strong, lemma, review, expected):
    lemmas = frozenset({"בחר", "חרת", "המונ", "אש", "הנ", "בוא", "בית", "בני"})
    found = dispositions.outside_root_letter(text, prefixes, strong, lemma, False, lemmas, review)
    assert (found and tuple(found)) == expected


def test_ledger_rejects_an_outside_queue_root_letter_decision_the_rule_does_not_support():
    occurrence = dict(book="acts", chapter=13, verse=45, word_index=4, text="הֲמוֹן", strong="Hd/H1995", prefixes=["Hd"])
    valid = dict(status="applied", action="set_strong", issue_type=dispositions.ROOT_LETTER_ISSUE,
                 reviewer=dispositions.OUTSIDE_ROOT_LETTER_REVIEWER, occurrence=occurrence, previous_strong="Hd/H1995",
                 new_strong="H1995", new_prefixes=[], logged_at="t", evidence=dict(basis="lemma_check"))
    certain = {"acts.13.45.4": dispositions.Reading(["Hd"], "המון", root_letter=dispositions.RootLetter([], "lemma_check", True))}
    [record] = dispositions.build_ledger([], {"acts.13.45.4": valid}, certain)["records"]
    assert (record["disposition"], record["after"]) == ("corrected", {"text": "הֲמוֹן", "strong": "H1995", "prefixes": []})
    uncertain = {"acts.13.45.4": dispositions.Reading(["Hd"], "המון", root_letter=dispositions.RootLetter([], "prefix_reading", False))}
    for decision, readings in (
        (valid, uncertain),
        (valid, {}),
        (dict(valid, new_strong="Hd/H1995"), certain),
        (dict(valid, new_prefixes=["Hd"]), certain),
        (dict(valid, evidence=dict(basis="reviewed_strong")), certain),
        (dict(valid, previous_strong="H1995"), certain),
    ):
        with pytest.raises(ValueError, match="does not satisfy the outside-queue root-letter rule"):
            dispositions.build_ledger([], {"acts.13.45.4": decision}, readings)


def test_a_correction_the_rule_no_longer_supports_is_withdrawn_through_the_decision_log():
    sons = next(
        json.loads(line) for line in reversed((dispositions.REPORTS.parent / "decisions/ephesians.jsonl").read_text(encoding="utf-8").splitlines())
        if '"word_index": 2' in line and '"verse": 5' in line and '"chapter": 1' in line
    )
    assert (sons["issue_type"], sons["status"], sons["previous_strong"], sons["new_strong"], sons["new_prefixes"]) == (
        dispositions.WITHDRAWN_ROOT_LETTER_ISSUE, "applied", "H3836", "Hl/Hb/H3836", ["Hl", "Hb"])
    assert all(record["location"] != "ephesians.1.5.2" for record in dispositions.read_ledger()["records"])
    assert "ephesians.1.5.2" not in dispositions.strong_reviews()
    assert "לְ/בָ/נִים" in parsed_verse("ephesians", 1, 5)["hebrew"]
