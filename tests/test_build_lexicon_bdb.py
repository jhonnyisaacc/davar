import json
import xml.etree.ElementTree as ET
from pathlib import Path


from scripts.dict.build_lexicon import (
    def_gloss_parts,
    extract_bdb_definitions_with_sense,
    preserve_existing_definition_metadata,
)
from scripts.dict.audit_missing_senses import gloss_matches, normalize_gloss
from scripts.dict import bdb_truncated_glosses, validator


BDB_NS = "http://openscriptures.github.com/morphhb/namespace"


def test_extract_bdb_definitions_keeps_all_lexical_index_homonyms_and_senses():
    bdb_root = ET.fromstring(
        f"""
        <bdb xmlns="{BDB_NS}">
          <entry id="t.ai.aa" type="root" mod="I">
            <w>רָבָה</w>
            <def>be</def>, <def>become</def>, <def>much</def>, <def>many</def>, <def>great</def>
            <sense><stem>Qal</stem>
              <sense n="1"><def>become many</def>, <def>numerous</def></sense>
              <sense n="2">
                <sense n="a"><def>be great</def></sense>
                <sense n="b"><def>grow great</def></sense>
              </sense>
            </sense>
            <sense><stem>Pi</stem>. <def>make large</def>, <def>increase</def></sense>
            <sense><stem>Hiph</stem>.
              <sense n="1"><def>make much</def> or <def>many</def></sense>
              <sense n="2"><def>make great</def></sense>
            </sense>
          </entry>
          <entry id="t.aj.aa" type="root" mod="II">
            <w>רָבָה</w>
            <def>shoot</def>
          </entry>
        </bdb>
        """
    )
    lexical_index = {
        "strong_to_bdb": {"H7235": ["t.ai.aa", "t.aj.aa"]},
        "bdb_to_def": {"t.ai.aa": "be much", "t.aj.aa": "shoot"},
    }

    definitions = extract_bdb_definitions_with_sense(
        "H7235",
        "רָבָה",
        bdb_root,
        lexical_index,
    )

    texts = [definition["text_en"] for definition in definitions]
    assert texts == [
        "be much",
        "become many",
        "numerous",
        "be great",
        "grow great",
        "make large",
        "increase",
        "make much",
        "many",
        "make great",
        "shoot",
    ]
    assert all(text not in texts for text in ["be", "become", "much", "great"])


def test_single_word_synonyms_are_not_collapsed_to_single_word_lexical_gloss():
    bdb_root = ET.fromstring(
        f"""
        <bdb xmlns="{BDB_NS}">
          <entry id="r.bk.aa" type="root" mod="II">
            <w>צוּר</w>
            <def>confine</def>, <def>bind</def>, <def>besiege</def>
          </entry>
        </bdb>
        """
    )
    lexical_index = {
        "strong_to_bdb": {"H6696": ["r.bk.aa"]},
        "bdb_to_def": {"r.bk.aa": "confine"},
    }

    definitions = extract_bdb_definitions_with_sense(
        "H6696",
        "צוּר",
        bdb_root,
        lexical_index,
    )

    assert [definition["text_en"] for definition in definitions] == ["confine", "bind", "besiege"]


def test_a_gloss_that_breaks_off_keeps_the_inline_word_or_definition_that_completes_it():
    bdb_root = ET.fromstring(
        f"""
        <bdb xmlns="{BDB_NS}">
          <entry id="s.bk.ai">[<w>קִינֵן</w>] <pos>vb. denom</pos>. <stem>Pō‛l</stem>. <def>chant a</def> <w src="s.bk.ah">קִינָה</w></entry>
          <entry id="u.ay.ac">[<w>שָׂטַן</w>] <pos>vb. denom</pos>. <def>be</def> or <def>act as adversary</def></entry>
          <entry id="a.ab.aa"><w>אבב</w> (<def>fresh</def>, <def>bright</def>)</entry>
          <entry id="h.cn.aa"><w>חָלָה</w> <sense><stem>Qal</stem> <def>be</def> or <def>become weak</def>, <def>sick</def></sense></entry>
        </bdb>
        """
    )
    lexical_index = {"strong_to_bdb": {"H6969": ["s.bk.ai"], "H7853": ["u.ay.ac"], "H3": ["a.ab.aa"], "H2470": ["h.cn.aa"]}}

    def texts(strong, lemma):
        return [d["text_en"] for d in extract_bdb_definitions_with_sense(strong, lemma, bdb_root, lexical_index)]

    assert texts("H6969", "קִינֵן") == ["chant a קִינָה"]
    assert texts("H7853", "שָׂטַן") == ["be or act as adversary"]
    assert texts("H3", "אבב") == ["fresh", "bright"]
    assert texts("H2470", "חָלָה") == ["be or become weak", "sick"]


def test_a_truncated_lexicon_gloss_is_completed_and_its_split_continuation_dropped():
    bdb_root = ET.fromstring(
        f"""
        <bdb xmlns="{BDB_NS}">
          <entry id="u.ay.ac">[<w>שָׂטַן</w>] <def>be</def> or <def>act as adversary</def></entry>
          <entry id="s.bk.ai">[<w>קִינֵן</w>] <def>chant a</def> <w>קִינָה</w></entry>
        </bdb>
        """
    )
    lexicon = {
        "H7853": {"definitions": [
            {"text_en": "be", "text_es": "ser", "source": "bdb", "order": 1, "sense": "0"},
            {"text_en": "act as adversary", "text_es": "actuar como adversario", "source": "bdb", "order": 2, "sense": "0"},
            {"text_en": "Satan", "source": "custom", "order": 3},
        ]},
        "H6969": {"definitions": [{"text_en": "chant a", "source": "bdb", "order": 1, "sense": "0"}]},
    }
    mapping = {"H7853": ["u.ay.ac"], "H6969": ["s.bk.ai"]}
    repairs = bdb_truncated_glosses.derive(lexicon, bdb_root, mapping)
    assert [(r.strong, r.order, r.after, r.absorbed_orders) for r in repairs] == [
        ("H6969", 1, "chant a קִינָה", ()), ("H7853", 1, "be or act as adversary", (2,)),
    ]
    spanish = {"be or act as adversary": "ser o actuar como adversario", "chant a קִינָה": "entonar una קִינָה"}
    for repair in repairs:
        bdb_truncated_glosses.apply(lexicon[repair.strong], [repair], spanish)
    assert [(d["text_en"], d.get("text_es")) for d in lexicon["H7853"]["definitions"]] == [
        ("be or act as adversary", "ser o actuar como adversario"), ("Satan", None),
    ]
    assert bdb_truncated_glosses.derive(lexicon, bdb_root, mapping) == []


def test_a_gloss_continues_past_a_comma_and_an_abbreviated_divine_name():
    bdb_root = ET.fromstring(
        f"""
        <bdb xmlns="{BDB_NS}">
          <entry id="h.cn.aa"><w>חָלָה</w> <def>be</def>, <def>become weak</def></entry>
          <entry id="g.aa.aa"><w>גְּאַלְיָה</w> <def>May</def> <w>י׳</w> <def>give joy!</def></entry>
          <entry id="b.aa.aa"><w>בָּא</w> <def>go to</def>, or <def>in</def>, <def>the city</def></entry>
          <entry id="k.aa.aa"><w>כִּי</w> <def>that</def>, <def>for</def></entry>
        </bdb>
        """
    )
    texts = {entry.get("id"): [part.text for part in def_gloss_parts(entry)] for entry in bdb_root}
    assert texts == {
        "h.cn.aa": ["be or become weak"],
        "g.aa.aa": ["May YHWH give joy!"],
        "b.aa.aa": ["go to or in the city"],
        "k.aa.aa": ["that", "for"],
    }


def test_a_cut_off_gloss_stored_under_an_entry_whose_bdb_text_lacks_it_is_dropped():
    bdb_root = ET.fromstring(
        f"""
        <bdb xmlns="{BDB_NS}">
          <entry id="u.ay.ac">[<w>שָׂטַן</w>] <def>be</def> or <def>act as adversary</def></entry>
          <entry id="r.aa.aa"><w>רוּם</w> <def>be high</def></entry>
        </bdb>
        """
    )
    lexicon = {"H7311": {"definitions": [
        {"text_en": "be high", "source": "bdb", "order": 1},
        {"text_en": "be", "text_es": "ser", "source": "bdb", "order": 2},
    ]}}
    repairs = bdb_truncated_glosses.derive(lexicon, bdb_root, {"H7311": ["r.aa.aa"]})
    assert [(r.strong, r.order, r.after) for r in repairs] == [("H7311", 2, None)]
    bdb_truncated_glosses.apply(lexicon["H7311"], repairs, {})
    assert [d["text_en"] for d in lexicon["H7311"]["definitions"]] == ["be high"]


def test_a_bdb_record_whose_english_is_in_the_spanish_table_takes_that_spanish():
    lexicon = {"H8380": {"definitions": [
        {"text_en": "twin", "source": "bdb", "order": 1},
        {"text_en": "twin", "text_es": "gemelo", "source": "bdb", "order": 2},
        {"text_en": "twin", "text_es": "mellizo", "source": "custom", "order": 3},
    ]}}
    drift = bdb_truncated_glosses.spanish_drift(lexicon, {"twin": "gemelo"})
    assert [(r.strong, r.order) for r in drift] == [("H8380", 1)]
    bdb_truncated_glosses.apply(lexicon["H8380"], drift, {"twin": "gemelo"})
    assert [d.get("text_es") for d in lexicon["H8380"]["definitions"]] == ["gemelo", "gemelo", "mellizo"]


def test_no_truncated_bdb_gloss_remains_in_the_lexicon():
    _, repairs = bdb_truncated_glosses.lexicon_repairs()
    assert repairs == []


def test_validator_flags_fragmented_main_bdb_definitions(tmp_path, monkeypatch):
    roots_dir = tmp_path / "roots"
    words_dir = tmp_path / "words"
    roots_dir.mkdir()
    words_dir.mkdir()
    (roots_dir / "H7235.json").write_text(
        json.dumps(
            {
                "strong_number": "H7235",
                "definitions": [
                    {"text_en": "be", "source": "bdb", "sense": "0"},
                    {"text_en": "become", "source": "bdb", "sense": "0"},
                    {"text_en": "much", "source": "bdb", "sense": "0"},
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(validator.config, "LEXICON_ROOTS_DIR", roots_dir)
    monkeypatch.setattr(validator.config, "LEXICON_WORDS_DIR", words_dir)

    result = validator.check_fragmented_main_bdb_definitions()

    assert result["count"] == 1
    assert result["samples"][0]["strong_number"] == "H7235"


def test_missing_sense_audit_matches_normalized_glosses():
    assert normalize_gloss("act (ruinously) corruptly") == "act corruptly"
    assert gloss_matches("collection", {"collection, collected mass"})
    assert not gloss_matches("collection", {"hope"})


def test_rebuild_preserves_reviewed_definitions_and_existing_translations():
    generated = [
        {"text_en": "watch", "source": "bdb", "order": 1, "sense": "0"},
        {"text_en": "guard", "source": "bdb", "order": 2, "sense": "0"},
    ]
    existing = [
        {
            "text_en": "watch",
            "text_es": "vigilia",
            "source": "bdb",
            "order": 1,
            "sense": "0",
        },
        {
            "text_en": "watch; night watch period.",
            "text_es": "vigilia; período de guardia nocturna.",
            "source": "delitzsch_review",
            "order": 2,
            "sense": "0",
        },
    ]

    merged = preserve_existing_definition_metadata(generated, existing)

    assert merged[0]["text_es"] == "vigilia"
    assert merged[2] == {
        "text_en": "watch; night watch period.",
        "text_es": "vigilia; período de guardia nocturna.",
        "source": "delitzsch_review",
        "order": 3,
        "sense": "0",
    }


def test_rebuild_preserves_translations_for_collapsed_bdb_phrases():
    generated = [
        {"text_en": "put, place, set", "source": "bdb", "order": 1, "sense": "0"},
    ]
    existing = [
        {"text_en": "put", "text_es": "poner", "source": "bdb", "order": 1, "sense": "0"},
        {"text_en": "place", "text_es": "colocar", "source": "bdb", "order": 2, "sense": "0"},
        {"text_en": "set", "text_es": "poner", "source": "bdb", "order": 3, "sense": "0"},
    ]

    merged = preserve_existing_definition_metadata(generated, existing)

    assert merged[0]["text_es"] == "poner; colocar; poner"


def test_h3068_lexicon_has_no_translit_fields():
    repo_root = Path(__file__).resolve().parents[1]
    source = json.loads(
        (repo_root / "data/dict/lexicon/words/H3068.json").read_text(encoding="utf-8")
    )
    assert "translit_en" not in source
    assert "translit_es" not in source


def test_h3068_backfill_does_not_reintroduce_display_transliteration():
    from scripts.dict.update_transliterations import update_strong_entry
    for strong in ("H3068", "Hb/H3068"):
        result = update_strong_entry({"strong_number": strong, "transliteration": "Yhwh", "translit_en": "stale"})
        assert "translit_en" not in result and "translit_es" not in result
    assert update_strong_entry({"strong_number": "H3069", "transliteration": "Yhwh"})["translit_en"]
