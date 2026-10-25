"""Phase 3 definition hygiene: BiDi strip, gloss length, fuller-in-primary."""

from scripts.dict.definition_hygiene import (
    DEFAULT_MAX_GLOSS_CHARS,
    audit_custom_definitions,
    audit_entry_definitions,
    has_forbidden_controls,
    is_detail_definition,
    strip_definition_controls,
)
from scripts.dict.import_tcysite import clean_html
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
