"""Phase 3 definition hygiene: BiDi strip, gloss length, fuller-in-primary."""

import json
from pathlib import Path

import pytest

from scripts.dict.definition_hygiene import (
    DEFAULT_MAX_GLOSS_CHARS,
    audit_custom_definitions,
    audit_entry_definitions,
    has_forbidden_controls,
    is_detail_definition,
    strip_definition_controls,
)
from scripts.dict.import_tcysite import clean_html
from scripts.dict.spanish_realignment import shifted_runs
from scripts.greek.text_clean import clean_lexical_text


def test_strip_definition_controls_removes_bidi_and_zw():
    raw = "hola \u202bשלום\u202c mundo\u200e\u200b"
    assert strip_definition_controls(raw) == "hola שלום mundo"
    assert not has_forbidden_controls(strip_definition_controls(raw))


def test_clean_html_strips_bidi_controls():
    html = "<p>palabra \u202aextra\u202c</p>"
    cleaned = clean_html(html)
    assert "\u202a" not in cleaned
    assert "palabra" in cleaned
    assert "extra" in cleaned


def test_clean_lexical_text_strips_bidi_after_markup():
    raw = "word \u202bnote\u202c {L:foo}"
    cleaned = clean_lexical_text(raw)
    assert "\u202b" not in cleaned
    assert "foo" in cleaned


def test_is_detail_definition_flags_detail_and_fuller():
    assert is_detail_definition(
        {"source": "tcysite-greek-detail", "text_es": "x"}
    )
    assert is_detail_definition(
        {"source": "custom", "definition_kind": "lexical_detail", "text_es": "x"}
    )
    assert is_detail_definition(
        {"source": "stepbible-tbesg", "role": "fuller", "text_en": "x"}
    )
    assert not is_detail_definition(
        {"source": "stepbible-tbesg", "role": "short", "text_en": "word"}
    )


def test_audit_entry_flags_long_primary_and_detail_as_short():
    long_gloss = "x" * (DEFAULT_MAX_GLOSS_CHARS + 10)
    issues = audit_entry_definitions(
        "G3056",
        [
            {"source": "stepbible-tbesg", "role": "short", "text_en": "word"},
            {
                "source": "tcysite-greek-detail",
                "definition_kind": "lexical_detail",
                "role": "short",
                "text_es": "dump",
            },
            {"source": "custom", "text_en": long_gloss},
        ],
    )
    assert any("role=short" in issue for issue in issues)
    assert any("primary gloss length" in issue for issue in issues)


def test_audit_entry_allows_detail_when_short_exists_without_short_role():
    issues = audit_entry_definitions(
        "G3056",
        [
            {"source": "stepbible-tbesg", "role": "short", "text_en": "word"},
            {
                "source": "tcysite-greek-detail",
                "definition_kind": "lexical_detail",
                "text_es": "long dump",
            },
            {
                "source": "stepbible-tbesg",
                "role": "fuller",
                "text_en": "scholarly fuller",
            },
        ],
    )
    assert issues == []


def test_audit_custom_definitions_counts_control_hits():
    report = audit_custom_definitions(
        {
            "G1": {
                "definitions": [
                    {
                        "source": "tcysite-eric",
                        "text_es": "hola \u202badios\u202c",
                    }
                ]
            },
            "H430": {
                "definitions": [
                    {"source": "custom", "text_en": "God"},
                ]
            },
        },
        sample_limit=10,
    )
    assert report["entries_checked"] == 2
    assert report["control_char_hits"] >= 1
    assert any("forbidden Unicode" in issue for issue in report["sample_issues"])


def test_acceptance_samples_h430_g3056_g2424g_shapes():
    """Fixture-shaped acceptance: short primary OK; fuller/detail not primary."""
    h430 = audit_entry_definitions(
        "H430",
        [
            {"source": "custom", "text_en": "MIGHTY ONE", "text_es": "PODEROSO"},
            {"source": "bdb", "sense": "1a", "text_en": "rulers"},
        ],
    )
    assert h430 == []

    g3056 = audit_entry_definitions(
        "G3056",
        [
            {"source": "stepbible-tbesg", "role": "short", "text_en": "word"},
            {
                "source": "stepbible-tbesg",
                "role": "fuller",
                "text_en": "λόγος long essay",
            },
            {
                "source": "tcysite-greek-detail",
                "definition_kind": "lexical_detail",
                "text_es": "detail dump",
            },
        ],
    )
    assert g3056 == []

    g2424 = audit_entry_definitions(
        "G2424G",
        [
            {"source": "stepbible-tbesg", "role": "short", "text_en": "Jesus"},
            {
                "source": "stepbible-tbesg",
                "role": "fuller",
                "text_en": "Ἰησοῦς essay",
            },
        ],
    )
    assert g2424 == []


def test_published_lexicon_definitions_match_their_entry_shards():
    import json
    from pathlib import Path

    lexicon = Path(__file__).resolve().parents[1] / "data/dict/lexicon"
    drift = []
    for name in ("words", "roots"):
        published = json.loads((lexicon / f"{name}.json").read_text(encoding="utf-8"))
        for shard in sorted((lexicon / name).glob("*.json")):
            entry = json.loads(shard.read_text(encoding="utf-8"))
            if entry.get("definitions") != published.get(shard.stem, {}).get("definitions"):
                drift.append(f"{name}/{shard.stem}")
    assert drift == [], f"shard definitions differ from the published lexicon: {drift}"


LEXICON = Path(__file__).resolve().parents[1] / "data" / "dict" / "lexicon"


def load(name: str) -> dict:
    return json.loads((LEXICON / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", ["words.json", "roots.json"])
def test_published_spanish_glosses_sit_on_their_own_definition(name):
    runs = shifted_runs(load(name))
    assert runs == [], [
        [f"{gloss.strong}:{gloss.order} {gloss.text_en} -> {gloss.text_es}" for gloss in run.glosses]
        for run in runs
    ]


def test_kallah_glosses_read_daughter_in_law_and_bride():
    for name in ("words.json", "words/H3618.json"):
        entry = load(name)
        definitions = entry["H3618"]["definitions"] if "H3618" in entry else entry["definitions"]
        assert [(row["text_en"], row["text_es"]) for row in definitions] == [
            ("daughter-in-law", "nuera"),
            ("bride", "novia"),
        ]


def test_a_batch_whose_glosses_moved_up_one_definition_is_reported():
    shifted = load("words.json")
    strongs = list(shifted)
    first = strongs.index("H3600")
    rows = [
        definition
        for strong in strongs[first:first + 200]
        for definition in sorted(shifted[strong]["definitions"], key=lambda item: item.get("order", 999))
    ][:500]
    following = [row.get("text_es") for row in rows[1:]] + [""]
    for row, text_es in zip(rows, following):
        row["text_es"] = text_es

    span = set(strongs[first:first + 200])
    reported = [
        run for run in shifted_runs(shifted)
        if run.offset == 1 and all(gloss.strong in span for gloss in run.glosses)
    ]

    assert len(reported) >= 5
