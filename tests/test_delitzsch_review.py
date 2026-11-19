import json
import re
import unicodedata
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
    assert summary["total"] == 11528 + 16084 + 8529
    assert summary["by_disposition"]["unresolved"] == 0
    assert summary["by_family"]["prefix_metadata"] == {
        "benign": 1319, "corrected": 3856, "already_reviewed": 319, "unresolved": 0, "blocked": 0, "superseded": 0,
    }
    assert summary["by_family"]["outside_queue"] == {
        "benign": 9, "corrected": 8520, "already_reviewed": 0, "unresolved": 0, "blocked": 0, "superseded": 0,
    }
    assert summary["benign_lexical_review"] == {"pending": 0, "reviewed": 1691}
    assert summary["by_family"]["legacy_assignment"] == {
        "benign": 0, "corrected": 0, "already_reviewed": 0, "unresolved": 0, "blocked": 7918, "superseded": 8166,
    }
    assert {rule: summary["by_rule"][rule] for rule in ("legacy_without_candidate", "legacy_current_value", "legacy_blocked", "lexical_review")} == {
        "legacy_without_candidate": 4360, "legacy_current_value": 3806, "legacy_blocked": 7918, "lexical_review": 1456,
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
    assert [m["strong"] for m in need["evidence"]["current"]] == ["Hd/H6878", "Hd/H6878"]


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
    entry = dict(queue_entry("acts.1.13.17", ["prefix_metadata_disagreement"]), text="וּמַתַּי", strong="H4970")
    readings = {"acts.1.13.17": dispositions.Reading(["Hc"], "מתי")}
    [record] = dispositions.build_ledger([entry], {}, readings)["records"]
    assert (record["disposition"], record["evidence"]["prior_decision"], record["lexical_review"]) == ("benign", None, "pending")
    matthew = ledger_record("acts.1.13.17")
    assert (matthew["disposition"], matthew["rule"], matthew["after"]["strong"]) == ("corrected", "reviewed_strong_correction", "Hc/D0328")
    assert "lexical_review" not in ledger_record("acts.1.2.12")


def test_style_only_rule_leaves_unsettled_prefix_flags_alone():
    assert ledger_record("acts.13.15.14")["after"]["strong"] == "Hl/H859"
    assert ledger_record("acts.7.58.6")["after"]["strong"] == "Hc/Hd/H5707"
    assert {ledger_record(location)["rule"] for location in ("acts.13.15.14", "acts.7.58.6")} == {"reviewed_strong_correction"}
    assert ledger_record("acts.1.4.10")["disposition"] == "already_reviewed"
    assert ledger_record("acts.10.11.14")["after"]["strong"] == "Hk/H3671"
    assert (ledger_record("corinthians1.1.4.9")["disposition"], ledger_record("corinthians1.1.4.9")["after"]["strong"]) == ("corrected", "Hl/H859")
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
    assert (confidence["disposition"], confidence["rule"]) == ("corrected", "reviewed_strong_correction")
    assert (confidence["before"]["strong"], confidence["after"]["strong"], confidence["after"]["prefixes"]) == ("H2911", "H986", [])
    assert ledger_record("corinthians2.10.8.12")["after"]["strong"] == "Hl/H1129"
    assert (ledger_record("luke.8.30.7")["after"]["strong"], ledger_record("luke.8.30.7")["after"]["prefixes"]) == ("D0567", [])
    entry = dict(queue_entry("acts.28.31.11", ["prefix_metadata_disagreement"]), text="בִּטְחוֹן", strong="H2911")
    reviewed = {"status": "applied", "new_strong": "H2911", "reviewer": "r", "reason": "x", "logged_at": "t"}
    readings = {"acts.28.31.11": dispositions.Reading(["Hb"], "טחון", False, True)}
    [pending] = dispositions.build_ledger([entry], {}, readings)["records"]
    [confirmed] = dispositions.build_ledger([dict(entry, prior_review_status="applied")], {"acts.28.31.11": reviewed}, readings)["records"]
    assert (pending["disposition"], confirmed["disposition"], confirmed["lexical_review"]) == ("unresolved", "benign", "reviewed")


def test_style_only_rule_does_not_settle_a_prefix_an_equal_length_lemma_reads_as_root():
    without = ledger_record("hebrews.11.40.4")
    assert (without["disposition"], without["before"]["strong"], without["before"]["prefixes"]) == ("corrected", "H5722", ["Hb", "Hl"])
    assert (without["after"]["strong"], without["after"]["prefixes"]) == ("H1107", [])
    assert dispositions.reads_prefix_as_root("בלעדינו", 2, "עדינו", frozenset({"בלעדי"}))
    assert not dispositions.reads_prefix_as_root("כדברו", 1, "דבר", frozenset({"כדב"}))
    assert ledger_record("acts.1.8.12")["disposition"] == "benign"


def test_style_only_rule_does_not_read_a_verb_stem_he_as_the_article():
    stood = ledger_record("acts.6.6.2")
    assert (stood["before"]["text"], stood["before"]["prefixes"], stood["after"]["strong"], stood["after"]["prefixes"]) == ("הֶעֱמִידוּ", ["Hd"], "H5975", [])
    assert ledger_record("romans.15.30.11")["after"]["strong"] == "Hb/H6279"
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


def test_suffixed_prepositions_use_the_exact_form_entry_with_or_without_a_conjunctive_dagesh():
    entries = {"לִי": "D0265", "לוֹ": "D0266", "לְךָ": "D0274", "לָךְ": "D0275", "לָהּ": "D0276"}
    found = Counter()
    for path in (dispositions.ROOT / "data/delitzsch/parsed").glob("*/*.json"):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for verse in (payload[0] if isinstance(payload, list) else payload)["verses"]:
            for word in verse["words"]:
                pointed = unicodedata.normalize("NFC", re.sub(r"[^\u05b0-\u05bc\u05c1\u05c2\u05c7\u05d0-\u05ea]", "", word["text"]))
                form = re.sub(r"^ל([\u05b0-\u05bb]*)\u05bc", r"ל\1", pointed)
                if form in entries:
                    found[(form, pointed != form, word["strong"])] += 1
    assert {key for key in found if key[2] != entries[key[0]]} == set()
    assert {(form, dotted) for form, dotted, _ in found} == {(form, dotted) for form in entries for dotted in (False, True)}


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


def test_follow_up_lexical_review_maps_hebrew_letters_and_suffixed_prepositions_to_their_entries():
    letters = ledger_record("corinthians2.10.10.2")
    assert (letters["disposition"], letters["before"]["strong"], letters["after"]["strong"]) == ("corrected", "H1431", "Hd/H107")
    assert ledger_record("thessalonians2.3.17.8")["after"] == {"text": "הָאִגְּרוֹת", "strong": "Hd/H107", "prefixes": ["Hd"]}
    to_me = ledger_record("corinthians1.5.12.2")
    assert (to_me["source"], to_me["before"]["strong"], to_me["after"]["strong"]) == ("decision_log", "H107", "D0265")
    assert ledger_record("acts.10.5.2")["after"]["strong"] == "D0274"
    assert ledger_record("romans.14.6.19")["after"]["strong"] == "H3034"
    temptation = ledger_record("matthew.6.13.3")
    assert (temptation["disposition"], temptation["reviewer"], temptation["after"]["strong"]) == ("corrected", "claude-delitzsch-review", "D0428")
    assert parsed_verse("luke", 7, 6)["words"][17]["strong"] == "H994"
    assert ledger_record("luke.4.34.3")["after"]["strong"] == "Hc/D0275"
    assert [ledger_record(location)["after"]["strong"] for location in ("luke.18.41.4", "john.21.22.10", "luke.18.19.5", "acts.22.15.3")] == ["D0275", "D0274", "D0265", "D0266"]
    assert [ledger_record(location)["after"]["strong"] for location in ("luke.23.25.15", "john.14.17.10", "john.14.21.10")] == ["H4560", "H7200", "H157"]
    assert [w["strong"] for w in parsed_verse("thessalonians2", 3, 17)["words"] if w["strong"].endswith(("H104", "H107"))] == ["Hd/H107"]


def test_plausible_prefix_readings_are_settled_by_lexical_review_not_by_the_root_letter_rule():
    for location, strong, prefixes in (
        ("luke.18.29.5", "Hl/H859", ["Hl"]),
        ("matthew.6.24.26", "Hd/D0084", ["Hd"]),
        ("matthew.2.2.7", "H3556", []),
    ):
        record = ledger_record(location)
        assert (record["rule"], record["reviewer"], record["after"]["strong"], record["after"]["prefixes"]) == (
            "reviewed_strong_correction", "claude-delitzsch-review", strong, prefixes)


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
    assert len(committed["decisions"]) == 68


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
        dict(valid, reason=None),
        dict(valid, evidence={key: value for key, value in evidence.items() if key != "context"}),
    ):
        with pytest.raises(ValueError, match="does not satisfy the reviewed Strong correction rule"):
            dispositions.build_ledger([], {"mark.13.19.11": decision})


def lexical_reviewed(action, status, new_strong, **extra):
    occurrence = dict(book="corinthians1", chapter=11, verse=22, word_index=1, text="לָכֶם", strong="H5083", prefixes=["Hl"])
    return {
        **dict(
            status=status, action=action, issue_type=dispositions.LEXICAL_ISSUE, reviewer="claude-delitzsch-review",
            occurrence=occurrence, previous_strong="H5083", new_strong=new_strong, reason="H5083 gift is unrelated", logged_at="t",
            evidence=dict(lexicon="H859 you", grammar="preposition with 2mp suffix", context="have you no houses"),
        ),
        **extra,
    }


def lexical_ledger(decision):
    entry = dict(queue_entry("corinthians1.11.22.1", ["prefix_metadata_disagreement"]), text="לָכֶם", strong="H5083")
    [record] = dispositions.build_ledger([entry], {entry["location"]: decision})["records"]
    return record


def test_lexical_reviews_keep_correct_or_block_a_queued_occurrence():
    kept = lexical_ledger(lexical_reviewed("skip", "skipped", "H5083"))
    assert (kept["disposition"], kept["rule"], kept["reviewer"], kept["lexical_review"]) == ("benign", "lexical_review", "claude-delitzsch-review", "reviewed")
    blocked = lexical_ledger(lexical_reviewed("needs_manual_review", "needs_manual_review", "H5083"))
    assert (blocked["disposition"], blocked["evidence"]["reason"]) == ("blocked", "H5083 gift is unrelated")
    corrected = lexical_ledger(lexical_reviewed("set_strong", "applied", "Hl/H859"))
    assert (corrected["disposition"], corrected["rule"], corrected["rule_version"]) == ("corrected", "reviewed_strong_correction", 3)
    assert (corrected["before"], corrected["after"]) == (
        {"text": "לָכֶם", "strong": "H5083", "prefixes": ["Hl"]}, {"text": "לָכֶם", "strong": "Hl/H859", "prefixes": ["Hl"]})
    dropped = lexical_ledger(lexical_reviewed("set_strong", "applied", "H3922", new_prefixes=[]))
    assert dropped["after"] == {"text": "לָכֶם", "strong": "H3922", "prefixes": []}


@pytest.mark.parametrize("decision, rule", [
    (lexical_reviewed("skip", "skipped", "H859"), "lexical review rule"),
    (lexical_reviewed("skip", "skipped", "H5083", new_prefixes=[]), "lexical review rule"),
    (lexical_reviewed("skip", "skipped", "H5083", reviewer="rule:anything_v1"), "lexical review rule"),
    (lexical_reviewed("needs_manual_review", "needs_manual_review", "H5083", reason=""), "lexical review rule"),
    (lexical_reviewed("set_strong", "applied", "H859"), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "applied", "Hl/H5083"), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "applied", "Hb/H859", new_prefixes=["Hb"]), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "error", "Hl/H859"), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "applied", "Hl/H859", previous_strong="H3922"), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "applied", "Hl/H859", reviewer="rule:anything_v1"), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "applied", "Hl/H859", reason=None), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "applied", "Hl/H859", reason=""), "reviewed Strong correction rule"),
    (lexical_reviewed("set_strong", "applied", "Hl/H859", evidence=dict(lexicon="H859", grammar="suffix")), "reviewed Strong correction rule"),
])
def test_ledger_rejects_a_lexical_review_the_rules_do_not_support(decision, rule):
    with pytest.raises(ValueError, match=f"does not satisfy the {rule}"):
        lexical_ledger(decision)


def recorrected(first, second_strong, **extra):
    occurrence = dict(first["occurrence"], strong=first["new_strong"], prefixes=first.get("new_prefixes", first["occurrence"]["prefixes"]))
    return {**first, "occurrence": occurrence, "previous_strong": first["new_strong"], "new_strong": second_strong,
            "reason": "the first correction named the wrong word", "logged_at": "u", **extra}


def test_a_later_reviewed_correction_supersedes_an_earlier_one():
    first = lexical_reviewed("set_strong", "applied", "Hl/H859")
    second = recorrected(first, "H3922", new_prefixes=[])
    entry = dict(queue_entry("corinthians1.11.22.1", ["prefix_metadata_disagreement"]), text="לָכֶם", strong="H5083")
    history = {entry["location"]: [first, lexical_reviewed("needs_manual_review", "needs_manual_review", "Hl/H859"), second]}
    [record] = dispositions.build_ledger([entry], dispositions.with_superseded(history))["records"]
    assert (record["disposition"], record["rule"], record["rule_version"]) == ("corrected", "reviewed_strong_correction", 3)
    assert (record["before"], record["after"]) == (
        {"text": "לָכֶם", "strong": "H5083", "prefixes": ["Hl"]}, {"text": "לָכֶם", "strong": "H3922", "prefixes": []})
    assert [(link["previous_strong"], link["new_strong"]) for link in record["evidence"]["superseded"]] == [("H5083", "Hl/H859")]
    assert history[entry["location"]][0] == first

    creation = strong_corrected("mark.13.19.11", "הַבְּרִיאָה", "Hd/H1277", ["Hd"], "Hd/H1278")
    [outside] = dispositions.build_ledger([], dispositions.with_superseded({"mark.13.19.11": [creation, recorrected(creation, "Hd/H1279")]}))["records"]
    assert (outside["before"]["strong"], outside["after"]["strong"]) == ("Hd/H1277", "Hd/H1279")


@pytest.mark.parametrize("second", [
    recorrected(lexical_reviewed("set_strong", "applied", "Hl/H859"), "H3922", new_prefixes=[], previous_strong="Hl/H860"),
    recorrected(lexical_reviewed("set_strong", "applied", "Hl/H859"), "H3922", new_prefixes=[], evidence=dict(lexicon="H3922")),
    recorrected(lexical_reviewed("set_strong", "applied", "Hl/H859"), "H5083", new_prefixes=["Hl"]),
])
def test_a_later_correction_that_does_not_continue_the_earlier_one_is_rejected(second):
    entry = dict(queue_entry("corinthians1.11.22.1", ["prefix_metadata_disagreement"]), text="לָכֶם", strong="H5083")
    history = {entry["location"]: [lexical_reviewed("set_strong", "applied", "Hl/H859"), second]}
    with pytest.raises(ValueError, match="does not satisfy the reviewed Strong correction rule"):
        dispositions.build_ledger([entry], dispositions.with_superseded(history))


def chain_histories():
    first = lexical_reviewed("set_strong", "applied", "Hl/H859")
    unreasoned = lexical_reviewed("set_strong", "applied", "Hl/H859", reason=None)
    unsupported = lexical_reviewed("set_strong", "applied", "Hl/H859", evidence=dict(lexicon="H859"))
    renamed = recorrected(first, "H3922", new_prefixes=[])
    stale = recorrected(first, "Hl/H853", logged_at="v")
    return {
        "earlier link without a reason": [unreasoned, recorrected(unreasoned, "H3922", new_prefixes=[])],
        "earlier link without evidence": [unsupported, recorrected(unsupported, "H3922", new_prefixes=[], evidence=first["evidence"])],
        "later link starts from other prefixes": [first, dict(renamed, occurrence=dict(renamed["occurrence"], prefixes=[]))],
        "later link logged against a superseded state": [first, renamed, stale],
    }


@pytest.mark.parametrize("case", list(chain_histories()))
def test_a_correction_chain_is_rejected_unless_every_link_is_reviewed_and_continuous(case):
    entry = dict(queue_entry("corinthians1.11.22.1", ["prefix_metadata_disagreement"]), text="לָכֶם", strong="H5083")
    with pytest.raises(ValueError, match="does not satisfy the reviewed Strong correction rule"):
        dispositions.build_ledger([entry], dispositions.with_superseded({entry["location"]: chain_histories()[case]}))


def root_letter_link(prefixes, new_prefixes, **extra):
    strong = "/".join([*prefixes, "H3922"])
    link = root_letter_tagged("corinthians1.11.22.1", "לָכֶם", strong, prefixes, new_prefixes, "H3922")
    return dict(link, **{"new_strong": "/".join([*new_prefixes, "H3922"]), "reason": "ל is a root letter", **extra})


def corrected_after_root_letter(link):
    kept = link["new_prefixes"] or []
    later = lexical_reviewed("set_strong", "applied", "/".join([*kept, "H859"]), new_prefixes=kept)
    occurrence = dict(later["occurrence"], strong=link["new_strong"], prefixes=kept)
    return dict(later, occurrence=occurrence, previous_strong=link["new_strong"], superseded=[link])


def root_letter_chain_record(link):
    entry = dict(queue_entry("corinthians1.11.22.1", ["prefix_metadata_disagreement"]), text="לָכֶם", strong=link["previous_strong"])
    return dispositions.build_ledger([entry], {entry["location"]: corrected_after_root_letter(link)})["records"][0]


def test_a_root_letter_correction_is_a_link_in_a_reviewed_correction_chain():
    record = root_letter_chain_record(root_letter_link(["Hl"], []))
    assert (record["disposition"], record["before"]["strong"], record["after"]["strong"]) == ("corrected", "Hl/H3922", "H859")
    assert [(link["previous_strong"], link["new_strong"]) for link in record["evidence"]["superseded"]] == [("Hl/H3922", "H3922")]


@pytest.mark.parametrize("new_strong", ["Hl/H3922", "H3922"], ids=["prefixes in the new Strong", "bare Strong of an in-queue decision"])
def test_a_root_letter_link_that_keeps_a_prefix_records_the_new_strong_either_way(new_strong):
    record = root_letter_chain_record(root_letter_link(["Hl", "Hk"], ["Hl"], new_strong=new_strong))
    assert (record["disposition"], record["before"]["strong"], record["after"]["strong"]) == ("corrected", "Hl/Hk/H3922", "Hl/H859")


@pytest.mark.parametrize("link", [
    root_letter_link(["Hl"], ["Hl"]),
    root_letter_link(["Hb", "Hl"], ["Hl"]),
    root_letter_link(["Hl"], [], status="needs_manual_review"),
    root_letter_link(["Hl"], [], issue_type=dispositions.LEXICAL_ISSUE),
    dict(root_letter_link(["Hl"], []), new_prefixes=None),
    root_letter_link(["Hl"], [], new_strong="H859"),
    root_letter_link(["Hl"], [], previous_strong="Hl/H5083"),
    root_letter_link(["Hl"], [], reason=""),
    dict(root_letter_link(["Hl"], []), occurrence=dict(root_letter_link(["Hl"], [])["occurrence"], text="לָהֶם")),
], ids=["prefixes not shortened", "kept prefix not a leading prefix", "unconfirmed status", "not a root-letter decision",
        "no kept prefixes recorded", "new Strong names another word", "previous Strong is not the tagged one", "no reason",
        "logged against another word"])
def test_a_chain_link_that_the_root_letter_rule_does_not_support_is_rejected(link):
    with pytest.raises(ValueError, match="does not satisfy the reviewed Strong correction rule"):
        root_letter_chain_record(link)


def test_set_strong_moves_the_occurrence_between_instances_only_entries(tmp_path):
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    custom_path = lexicon_dir.parent / "custom_definitions.json"
    instance = {"book": "acts", "chapter": 1, "verse": 1, "word_index": 0, "text": "דִּבּוּר"}
    write_json(custom_path, {
        "D0900": {"strong_number": "D0900", "mapping_scope": "instances_only", "nt_instances": [instance], "definitions": [{"text_en": "a"}]},
        "D0901": {"strong_number": "D0901", "mapping_scope": "instances_only", "nt_instances": [], "definitions": [{"text_en": "b"}]},
    })
    write_json(tmp_path / "parsed" / "acts" / "1.json", [{"verses": [{"verse": 1, "hebrew": "דִּבּוּר", "words": [{"text": "דִּבּוּר", "strong": "D0900"}]}]}])
    write_json(tmp_path / "move.json", {"decisions": [{
        "action": "set_strong", "issue_type": "lexical_review", "reviewer": "claude-delitzsch-review",
        "occurrence": {**instance, "strong": "D0900", "prefixes": []}, "previous_strong": "D0900", "new_strong": "D0901",
    }]})
    apply_decisions(tmp_path / "move.json", tmp_path / "parsed", LexiconIndex(lexicon_dir), tmp_path / "log")
    custom = json.loads(custom_path.read_text(encoding="utf-8"))
    assert (custom["D0900"]["nt_instances"], custom["D0901"]["nt_instances"]) == ([], [instance])


def test_every_custom_entry_that_lists_its_occurrences_keeps_the_list_exact(tmp_path):
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    custom_path = lexicon_dir.parent / "custom_definitions.json"
    moved = {"book": "acts", "chapter": 18, "verse": 2, "word_index": 0, "text": "רוֹמִי"}
    missed = {"book": "acts", "chapter": 22, "verse": 25, "word_index": 0, "text": "רוֹמִי"}
    stale_view = [{**moved, "source_key": "acts 18:2"}]
    write_json(custom_path, {
        "D0141": {"strong_number": "D0141", "nt_instances": [moved], "instances": stale_view, "surface_instances": stale_view,
                  "definitions": [{"text_en": "Roman", "source": "custom", "order": 1}]},
        "D0705": {"strong_number": "D0705", "nt_instances": [], "definitions": [{"text_en": "Rome", "order": 1}]},
    })
    write_json(tmp_path / "parsed" / "acts" / "18.json", [{"verses": [{"verse": 2, "hebrew": "רוֹמִי", "words": [{"text": "רוֹמִי", "strong": "D0141"}]}]}])
    write_json(tmp_path / "parsed" / "acts" / "22.json", [{"verses": [{"verse": 25, "hebrew": "רוֹמִי", "words": [{"text": "רוֹמִי", "strong": "D0141"}]}]}])
    write_json(tmp_path / "batch.json", {"decisions": [
        {"action": "set_strong", "issue_type": "lexical_review", "reviewer": "claude-delitzsch-review",
         "occurrence": {**moved, "strong": "D0141", "prefixes": []}, "previous_strong": "D0141", "new_strong": "D0705"},
        {"action": "upsert_custom_definition", "strong": "D0141", "reviewer": "claude-delitzsch-review",
         "definition": {"text_en": "Roman", "source": "custom", "order": 1}, "nt_instances": [missed]},
    ]})
    apply_decisions(tmp_path / "batch.json", tmp_path / "parsed", LexiconIndex(lexicon_dir), tmp_path / "log")
    custom = json.loads(custom_path.read_text(encoding="utf-8"))
    assert (custom["D0141"]["nt_instances"], custom["D0705"]["nt_instances"]) == ([missed], [moved])
    assert [(i["book"], i["chapter"], i["verse"]) for i in custom["D0141"]["instances"]] == [("acts", 22, 25)]
    assert len(custom["D0141"]["definitions"]) == 1


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


def test_identifiers_without_definitions_end_with_a_lexical_review():
    but = ledger_record("corinthians2.3.6.9")
    assert (but["family"], but["disposition"], but["reviewer"]) == ("outside_queue", "corrected", "claude-delitzsch-review")
    assert (but["before"]["strong"], but["after"]["strong"]) == ("H414", "D0162")
    aram = ledger_record("acts.2.9.4")
    assert (aram["family"], aram["disposition"], aram["rule"], aram["lexical_review"]) == ("outside_queue", "benign", "lexical_review", "reviewed")
    ministry = ledger_record("corinthians2.6.3.7")
    assert (ministry["disposition"], ministry["before"]["strong"], ministry["after"]["strong"]) == ("corrected", "H1122", "D0308")
    assert parsed_verse("corinthians2", 6, 3)["words"][7]["strong"] == "D0308"
    southern = ledger_record("acts.28.13.7")
    assert (southern["disposition"], southern["rule"], southern["before"]["strong"], southern["after"]["strong"]) == (
        "corrected", "reviewed_strong_correction", "H1784", "D0325")


def definition_gaps_batch(name="definition_gaps_42"):
    path = dispositions.ROOT / f"data/delitzsch/review/batches/{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))["decisions"]


@pytest.mark.parametrize("name, created_count", [
    ("definition_gaps_42", 44), ("definition_gaps_42_round_2", 375), ("definition_gaps_42_round_3", 1), ("definition_gaps_42_round_4", 20),
    ("definition_gaps_42_round_5", 177), ("definition_gaps_42_round_7", 10),
])
def test_issue_42_entries_list_exactly_the_occurrences_reviewed_onto_them(name, created_count):
    custom = json.loads((dispositions.ROOT / "data/dict/lexicon/custom_definitions.json").read_text(encoding="utf-8"))
    corpus = Counter()
    for path in sorted((dispositions.ROOT / "data/delitzsch/parsed").glob("*/*.json")):
        if path.stem.isdigit():
            for verse in json.loads(path.read_text(encoding="utf-8"))[0]["verses"]:
                for index, word in enumerate(verse["words"]):
                    corpus[(word.get("strong") or "").split("/")[-1], f"{path.parent.name}.{path.stem}.{verse['verse']}.{index}"] += 1
    created = [d for d in definition_gaps_batch(name) if "nt_instances" in d and d["strong"].startswith("D")]
    assert len(created) == created_count
    for decision in created:
        entry = custom[decision["strong"]]
        assert entry.get("mapping_scope") == decision.get("mapping_scope")
        assert all(d["text_en"] and d["text_es"] for d in entry["definitions"])
        listed = {f"{i['book']}.{i['chapter']}.{i['verse']}.{i['word_index']}" for i in entry["nt_instances"]}
        assert listed == {location for strong, location in corpus if strong == decision["strong"]}
        for location in listed if "mapping_scope" in decision else ():
            record = ledger_record(location)
            assert (record["disposition"], record["reviewer"], record["after"]["strong"].split("/")[-1]) == (
                "corrected", "claude-delitzsch-review", decision["strong"])


@pytest.mark.parametrize("name, move_count, noted", [
    ("definition_gaps_42", 148, 1), ("definition_gaps_42_round_2", 685, 14), ("definition_gaps_42_round_3", 206, 6),
    ("definition_gaps_42_round_4", 417, 6), ("definition_gaps_42_round_5", 1866, 25),
    ("definition_gaps_42_round_7", 145, 4),
])
def test_issue_42_identity_evidence_names_a_greek_word_of_the_verse(name, move_count, noted):
    greek = dispositions.ROOT / "data/greek/preview/greek/releases/sblgnt/5de0a47f35f0fc13dfe1430d104e5db8a4285f9c/books"
    moves = [d for d in definition_gaps_batch(name) if d["action"] == "set_strong"]
    assert len(moves) == move_count
    assert sum("greek_note" in d["evidence"] for d in moves) == noted
    for decision in moves:
        occurrence = decision["occurrence"]
        verses = json.loads((greek / occurrence["book"] / f"{occurrence['chapter']}.json").read_text(encoding="utf-8"))["verses"]
        words = {f"{w['strong']} {w['lemma']}" for v in verses if v["verse"] == occurrence["verse"] for w in v["words"]}
        assert decision["evidence"].get("greek_note") or decision["evidence"]["greek"] in words, occurrence


def test_no_occurrence_stays_blocked_on_an_identifier_that_names_another_word():
    records = dispositions.read_ledger()["records"]
    assert [r["location"] for r in records if r["disposition"] == "blocked" and r["rule"] == "lexical_review"] == []
    hermas, hermes = ledger_record("romans.16.14.4"), ledger_record("romans.16.14.6")
    assert (hermas["after"]["strong"], hermes["after"]["strong"], ledger_record("acts.14.12.6")["after"]["strong"]) == ("Hc/D0645", "Hc/D0702", "D0338")


@pytest.mark.parametrize("book, chapter, verse, index, strong, gloss", [
    ("luke", 1, 21, 3, "D0534", "Zechariah; the priest, father of John the Baptist."),
    ("luke", 1, 5, 6, "D0534", "Zechariah; the priest, father of John the Baptist."),
    ("matthew", 23, 35, 13, "D0706", "Zechariah; the man killed between the sanctuary and the altar"),
    ("acts", 13, 1, 15, "D0333", "Manaen; a prophet at Antioch"),
    ("romans", 16, 14, 6, "D0702", "Hermes; a Christian in Rome greeted by Paul."),
    ("acts", 28, 1, 7, "D0699", "Melita; the island of Malta"),
    ("timothy1", 3, 13, 1, "D0402", "serve, minister"),
    ("acts", 21, 8, 11, "D0903", "Philip; the evangelist"),
    ("matthew", 16, 13, 7, "D0904", "Philip; the tetrarch"),
    ("matthew", 14, 3, 12, "D0905", "Philip; a son of Herod the Great"),
    ("corinthians1", 16, 15, 7, "D0907", "Stephanas; a believer of Corinth"),
    ("john3", 1, 1, 2, "D0057", "Gaius; a name borne by believers"),
    ("acts", 4, 6, 0, "D0189", "Annas;"),
])
def test_a_reviewed_new_testament_referent_shows_its_own_gloss_first(book, chapter, verse, index, strong, gloss):
    custom = json.loads((dispositions.ROOT / "data/dict/lexicon/custom_definitions.json").read_text(encoding="utf-8"))
    words = json.loads((dispositions.ROOT / "data/dict/lexicon/words.json").read_text(encoding="utf-8"))
    assert parsed_verse(book, chapter, verse)["words"][index]["strong"].split("/")[-1] == strong
    entry = custom.get(strong) if strong.startswith("D") else words[strong]
    assert entry["definitions"][0]["text_en"].startswith(gloss)


def test_a_reviewed_identity_supersedes_the_earlier_correction_it_replaces():
    melita = ledger_record("acts.28.1.7")
    assert (melita["disposition"], melita["before"]["strong"], melita["after"]["strong"]) == ("corrected", "H1784", "D0699")
    assert [(link["previous_strong"], link["new_strong"]) for link in melita["evidence"]["superseded"]] == [("H1784", "D0254")]
    assert parsed_verse("acts", 28, 1)["words"][7]["strong"] == "D0699"


def test_upsert_custom_definition_sets_scope_and_instances_only_when_it_creates_the_entry(tmp_path):
    lexicon_dir = tmp_path / "data" / "dict" / "lexicon" / "words"
    custom_path = lexicon_dir.parent / "custom_definitions.json"
    write_json(custom_path, {})
    instance = {"book": "acts", "chapter": 17, "verse": 1, "word_index": 7, "text": "תַּסְלוֹנִיקִי"}

    def upsert(text_en, scope):
        path = tmp_path / f"{text_en}.json"
        write_json(path, {"decisions": [{
            "action": "upsert_custom_definition", "strong": "D0900", "hebrew": "תַּסְלוֹנִיקִי", "reviewer": "claude-delitzsch-review",
            "mapping_scope": scope, "nt_instances": [instance], "definition": {"text_en": text_en, "text_es": text_en},
        }]})
        apply_decisions(path, tmp_path / "parsed", LexiconIndex(lexicon_dir), tmp_path / "log")

    upsert("Thessalonica", "instances_only")
    upsert("Thessalonike", "exact")
    entry = json.loads(custom_path.read_text(encoding="utf-8"))["D0900"]
    assert (entry["mapping_scope"], entry["nt_instances"]) == ("instances_only", [instance])
    assert [d["text_en"] for d in entry["definitions"]] == ["Thessalonica", "Thessalonike"]
    you = ledger_record("matthew.6.1.13")
    assert (you["family"], you["rule"], you["before"]["strong"], you["after"]["strong"]) == (
        "prefix_metadata", "reviewed_strong_correction", "H6889", "Hl/H859")


def test_reverting_restores_lexical_review_corrections_and_an_unrecorded_edit_still_fails():
    import gzip
    from scripts.delitzsch.review.remediate import digest, load_corpus
    plan = json.loads(gzip.decompress(dispositions.REPORT.read_bytes()))
    records = dispositions.read_ledger()["records"]

    def words(corpus, chapter_file, verse):
        payload = corpus[chapter_file]
        return next(v for v in (payload[0] if isinstance(payload, list) else payload)["verses"] if v["verse"] == verse)["words"]

    reverted = dispositions.revert_corrections(load_corpus(), records)
    assert (words(reverted, "ephesians/1.json", 5)[2]["strong"], words(reverted, "ephesians/1.json", 5)[2]["prefixes"]) == ("Hl/Hb/H3836", ["Hl", "Hb"])
    assert words(load_corpus(), "ephesians/1.json", 5)[2]["strong"] == "Hl/H1121"

    def edited(chapter_file, verse, index, strong):
        corpus = load_corpus()
        words(corpus, chapter_file, verse)[index]["strong"] = strong
        return corpus

    with pytest.raises(ValueError, match="corpus Strong differs"):
        dispositions.revert_corrections(edited("ephesians/1.json", 5, 2, "Hl/H1129"), records)
    assert ledger_record("acts.1.8.12")["disposition"] == "benign"
    assert digest(dispositions.revert_corrections(edited("acts/1.json", 8, 12, "Hc/Hb/H8112"), records)) != plan["corpus_after_sha256"]


def test_committed_outside_queue_root_letter_batch_matches_its_generator():
    committed = json.loads(dispositions.OUTSIDE_ROOT_LETTER_BATCH.read_text(encoding="utf-8"))
    assert committed == dispositions.outside_root_letter_batch_from_disk()
    assert Counter(item["evidence"]["basis"] for item in committed["decisions"]) == {"reviewed_strong": 2360, "lemma_check": 1518}
    assert committed["unresolved"] == []


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


def test_outside_queue_root_letter_matches_end_with_a_lexical_review():
    unresolved = {item["location"]: item["reason"] for item in json.loads(dispositions.OUTSIDE_ROOT_LETTER_BATCH.read_text(encoding="utf-8"))["unresolved"]}
    for location, book, chapter, verse, index, strong, rule in (
        ("revelation.14.10.14", "revelation", 14, 10, 14, "Hb/H784", "reviewed_strong_correction"),
        ("acts.6.1.18", "acts", 6, 1, 18, "Hl/H2007", "reviewed_strong_correction"),
        ("acts.10.2.6", "acts", 10, 2, 6, "H1121", "root_letter_prefix_outside_queue"),
        ("ephesians.1.5.2", "ephesians", 1, 5, 2, "Hl/H1121", "reviewed_strong_correction"),
        ("revelation.3.4.14", "revelation", 3, 4, 14, "H3836", "root_letter_prefix_outside_queue"),
    ):
        assert location not in unresolved
        assert ledger_record(location)["rule"] == rule
        assert parsed_verse(book, chapter, verse)["words"][index]["strong"] == strong
    assert "corinthians1.7.31.0" not in unresolved
    enjoying = ledger_record("corinthians1.7.31.0")
    assert (enjoying["disposition"], enjoying["before"]["strong"], enjoying["after"]["strong"]) == ("corrected", "Hc/Hd/H2008", "Hc/Hd/D0448")
    assert parsed_verse("corinthians1", 7, 31)["words"][0]["strong"] == "Hc/Hd/D0448"


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


def test_a_correction_the_rule_no_longer_supports_is_withdrawn_and_then_settled_by_lexical_review():
    history = [
        json.loads(line) for line in (dispositions.REPORTS.parent / "decisions/ephesians.jsonl").read_text(encoding="utf-8").splitlines()
        if '"word_index": 2' in line and '"verse": 5' in line and '"chapter": 1,' in line
    ]
    withdrawn, sons = history[-2:]
    assert (withdrawn["issue_type"], withdrawn["status"], withdrawn["previous_strong"], withdrawn["new_strong"], withdrawn["new_prefixes"]) == (
        dispositions.WITHDRAWN_ROOT_LETTER_ISSUE, "applied", "H3836", "Hl/Hb/H3836", ["Hl", "Hb"])
    assert (sons["issue_type"], sons["reviewer"], sons["previous_strong"], sons["new_strong"], sons["new_prefixes"]) == (
        dispositions.LEXICAL_ISSUE, "claude-delitzsch-review", "Hl/Hb/H3836", "Hl/H1121", ["Hl"])
    record = ledger_record("ephesians.1.5.2")
    assert (record["disposition"], record["after"]) == ("corrected", {"text": "לְבָנִים", "strong": "Hl/H1121", "prefixes": ["Hl"]})
    assert "לְ/בָנִים" in parsed_verse("ephesians", 1, 5)["hebrew"]
