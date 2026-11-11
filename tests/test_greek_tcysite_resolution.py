from collections import Counter

from scripts.dict.import_tcysite import (
    build_greek_key_index,
    fallback_id,
    normalize_term,
    resolve_greek,
    resolve_hebrew,
    target_for,
)

GREEK_TERM = "fixture-greek-term"
HEBREW_TERM = "fixture-hebrew-term"


def resolver(greek_lookup=None, hebrew_index=None, greek_keys=("G9901", "G9902")):
    state = {
        "greek_lookup": greek_lookup or {},
        "greek_key_index": build_greek_key_index(set(greek_keys)),
        "hebrew_index": hebrew_index or {},
        "used_ids": set(),
        "stats": Counter(),
        "fallback_rows": [],
    }

    def resolve(identity, language, term, transliteration=""):
        return target_for(identity, language, term, transliteration, **state)

    return resolve, state


def test_single_greek_candidate_resolves_exact():
    lookup = {normalize_term(GREEK_TERM): {"G9901"}}
    index = build_greek_key_index({"G9901"})
    assert resolve_greek(GREEK_TERM, "", lookup, index) == ("G9901", False)


def test_term_and_transliteration_merge_into_one_candidate_set():
    lookup = {
        normalize_term(GREEK_TERM): {"G9901"},
        normalize_term("fixture-translit"): {"G9902"},
    }
    index = build_greek_key_index({"G9901", "G9902"})
    assert resolve_greek(GREEK_TERM, "fixture-translit", lookup, index) == (None, True)


def test_several_greek_candidates_are_ambiguous():
    lookup = {normalize_term(GREEK_TERM): {"G9901", "G9902"}}
    index = build_greek_key_index({"G9901", "G9902"})
    assert resolve_greek(GREEK_TERM, "", lookup, index) == (None, True)


def test_site_ids_collapsing_to_one_key_are_not_ambiguous():
    lookup = {normalize_term(GREEK_TERM): {"G9901", "G09901"}}
    index = build_greek_key_index({"G9901"})
    assert resolve_greek(GREEK_TERM, "", lookup, index) == ("G9901", False)


def test_hebrew_single_several_and_missing():
    index = {
        normalize_term(HEBREW_TERM): {"H9901"},
        normalize_term("fixture-shared"): {"H9901", "H9902"},
    }
    assert resolve_hebrew(HEBREW_TERM, index) == ("H9901", False)
    assert resolve_hebrew("fixture-shared", index) == (None, True)
    assert resolve_hebrew("fixture-absent", index) == (None, False)


def test_ambiguous_row_takes_a_counted_fallback():
    resolve, state = resolver(
        hebrew_index={normalize_term("fixture-shared"): {"H9901", "H9902"}}
    )
    result = resolve("fixture:ambiguous", "hebrew", "fixture-shared")
    assert result.startswith("D")
    assert state["stats"] == Counter(ambiguous=1, unmatched=1, fallback=1)
    assert state["fallback_rows"] == [
        {
            "identity": "fixture:ambiguous",
            "language": "hebrew",
            "term": "fixture-shared",
            "id": result,
        }
    ]


def test_unmatched_row_is_not_counted_ambiguous():
    resolve, state = resolver()
    assert resolve("fixture:absent", "hebrew", "fixture-absent").startswith("D")
    assert state["stats"] == Counter(unmatched=1, fallback=1)


def test_exact_match_uses_no_fallback():
    resolve, state = resolver(hebrew_index={normalize_term(HEBREW_TERM): {"H9901"}})
    assert resolve("fixture:exact", "hebrew", HEBREW_TERM) == "H9901"
    assert state["stats"] == Counter(matched_canonical=1)
    assert state["used_ids"] == set()
    assert state["fallback_rows"] == []


def test_same_identity_yields_the_same_fallback_across_runs():
    assert fallback_id("fixture:stable", set()) == fallback_id("fixture:stable", set())
    assert fallback_id("fixture:stable", set()) != fallback_id("fixture:other", set())


def test_collision_probes_to_the_next_id_deterministically():
    first = fallback_id("fixture:stable", set())
    number = int(first[1:])
    used = {first}
    assert fallback_id("fixture:stable", used) == f"D{number + 1}"
    assert used == {first, f"D{number + 1}"}
