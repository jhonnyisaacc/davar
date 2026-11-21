import copy
import json
from pathlib import Path
import pytest
from scripts.delitzsch.review.remediate import build_plan, apply_plan, digest, encoded, pointed, publication_errors

class Lexicon:
    def get(self, strong):
        return {"lemma":"א"} if strong else None

def corpus(words):
    return {"jude/1.json":[{"chapter":1,"verses":[{"verse":1,"hebrew":" ".join(w["text"] for w in words),"words":words}]}]}

def test_exact_pointing_repairs_pronouns_but_does_not_guess_homographs():
    source=corpus([{"text":t,"strong":s,"prefixes":[]} for t,s in [("לוֹ","H7592"),("לוּ","H3863"),("בִּי","H994"),("בו","H1"),("לִי","H1350")]])
    before=copy.deepcopy(source)
    plan=build_plan(source,Lexicon(),{"jude.1.1.4":{"status":"skipped"}})
    assert source==before
    assert len(plan['changes'])==1
    assert plan['changes'][0]['after']['strong']=='D0266'
    assert plan['baseline']['hebrew_tokens']==plan['final']['hebrew_tokens']

def test_punctuation_is_preserved_without_a_fake_lexical_entry():
    source=corpus([{"text":"חָי","strong":"H2416","prefixes":[]},{"text":"׃","strong":"H539","prefixes":[]}])
    plan=build_plan(source,Lexicon(),{})
    verse=plan['files']['jude/1.json']['after'][0]['verses'][0]
    assert verse['words']==[{"text":"חָי׃","strong":"H2416","prefixes":[]}]
    assert verse['hebrew']==source['jude/1.json'][0]['verses'][0]['hebrew']
    assert plan['quality_gate']['passed']

def test_placeholder_ledger_retains_original_but_unrecognized_latin_text_blocks():
    source=corpus([{"text":"WO","strong":"H2245","prefixes":[]}])
    plan=build_plan(source,Lexicon(),{})
    assert plan['changes'][0]['before']==source['jude/1.json'][0]['verses'][0]
    assert plan['final']['tokens']==0
    other=corpus([{"text":"damaged","strong":"H1","prefixes":[]}])
    assert not build_plan(other,Lexicon(),{})['quality_gate']['passed']

def test_stale_batch_is_not_partially_applied_and_repeat_is_byte_stable(tmp_path):
    source=corpus([{"text":"לוֹ","strong":"H7592","prefixes":[]}])
    source['jude/2.json']=copy.deepcopy(source['jude/1.json'])
    source['jude/2.json'][0]['chapter']=2
    plan=build_plan(source,Lexicon(),{})
    for path,payload in source.items():
        target=tmp_path/path;target.parent.mkdir(exist_ok=True);target.write_bytes(encoded(payload))
    second=tmp_path/'jude/2.json';second.write_text('[]')
    first=(tmp_path/'jude/1.json').read_bytes()
    with pytest.raises(ValueError,match='Stale'):apply_plan(plan,tmp_path)
    assert (tmp_path/'jude/1.json').read_bytes()==first
    second.write_bytes(encoded(source['jude/2.json']))
    assert apply_plan(plan,tmp_path)==2
    written=(tmp_path/'jude/1.json').read_bytes()
    assert apply_plan(plan,tmp_path)==0
    assert (tmp_path/'jude/1.json').read_bytes()==written
    assert digest(plan)==digest(build_plan(source,Lexicon(),{}))

def test_needs_review_candidates_cannot_be_published():
    data=corpus([{"text":"א","strong":"H1","prefixes":[],"mapping_review":{"status":"needs_review"}}])
    assert publication_errors(data,Lexicon())==[['jude.1.1.0','unreviewed_candidate_published']]

def test_custom_instance_sync_preserves_existing_and_is_idempotent(tmp_path):
    from scripts.delitzsch.review.remediate import sync_custom_instances
    source=corpus([{"text":"לוֹ","strong":"H7592","prefixes":[]}])
    plan=build_plan(source,Lexicon(),{})
    target=tmp_path/'custom.json'
    existing={"book":"acts","chapter":1,"verse":1,"word_index":2,"text":"לוֹ"}
    target.write_text(json.dumps({"D0266":{"nt_instances":[existing],"definitions":["retained"]}}))
    assert sync_custom_instances(plan,target)==1
    first=target.read_bytes()
    assert sync_custom_instances(plan,target)==0
    assert target.read_bytes()==first
    entry=json.loads(first)['D0266']
    assert entry['nt_instances'][0]==existing
    assert entry['definitions']==['retained']

def test_checked_in_repairs_match_narrow_rules_and_preserve_scripture():
    import gzip
    from collections import Counter
    from scripts.delitzsch.review.remediate import GRAMMAR
    plan=json.load(gzip.open('data/delitzsch/review/reports/besorah_remediation_v1.json.gz'))
    mappings=[c for c in plan['changes'] if c['kind']=='mapping']
    assert Counter(c['after']['strong'] for c in mappings)=={'D0208':271,'D0265':196,'D0266':539,'D0271':50,'D0277':48,'H1058':1}
    for change in mappings:
        if change['after']['strong']=='H1058':
            assert change['location']=='acts.9.39.12'
            assert change['after']['prefixes']==[]
        else:
            assert GRAMMAR[pointed(change['before']['text'])]==change['after']['strong']
        assert change['before']['text']==change['after']['text']
    assert plan['baseline']['hebrew_character_sha256']==plan['final']['hebrew_character_sha256']

def test_definition_coverage_separates_sources_languages_and_missing_entries(tmp_path):
    from scripts.delitzsch.definition_coverage import build_report, check_errors, encoded, occurrence_counts
    chapter=tmp_path/"jude"/"1.json"; chapter.parent.mkdir(parents=True)
    words=[{"text":"א","strong":s} for s in ["Hc/Hd/H1","H1","D2","H3","H4"]]
    chapter.write_text(json.dumps([{"chapter":1,"verses":[{"verse":1,"words":words}]}]))
    sources={"words":{"H1":{"definitions":[{"text_en":"father"}]}},"roots":{"H4":{"definitions":[{"text_en":" ","text_es":"raíz"}]}},
        "custom_definitions":{"D2":{"definitions":[{"text_en":"in her","text_es":"en ella"}],"publication":{"status":"approved"}},"H1":{"definitions":[{"text_es":"padre"}]}}}
    report=build_report(occurrence_counts(tmp_path),sources)
    assert report["identifiers"]=={"H1":{"source":"canonical_and_custom","languages":["en","es"],"occurrences":2},
        "D2":{"source":"custom","languages":["en","es"],"status":"approved","occurrences":1},"H4":{"source":"canonical","languages":["es"],"occurrences":1}}
    assert report["missing_entries"]==[{"strong":"H3","occurrences":1}]
    assert report["missing_definitions"]=={"en":[{"strong":"H4","source":"canonical","occurrences":1}],"es":[]}
    errors=check_errors(report,encoded(report),{"en":["H4","H9"],"es":[]})
    assert errors==["H3 has no lexicon entry (1 occurrences)",
        "H9 now has a en definition; remove it from data/delitzsch/review/definition_gaps_baseline.json"]
    assert check_errors(report,encoded(report),{"en":[],"es":[]})[-1].startswith("H4 has no en definition")

def test_committed_definition_coverage_is_current_and_gaps_only_shrink():
    from scripts.delitzsch.definition_coverage import BASELINE, REPORT, build_report, check_errors, load_lexicon, occurrence_counts
    report=build_report(occurrence_counts(),load_lexicon())
    assert check_errors(report,REPORT.read_text(encoding="utf-8"),json.loads(BASELINE.read_text(encoding="utf-8")))==[]

def test_publication_status_comes_from_reviewed_decisions_only(tmp_path):
    from scripts.delitzsch.entry_publication import load_ledger, publication
    rows=[{"action":"create_custom_entry","status":"applied","reviewer":"r","custom_key":"D1","definition":{"text_en":"Peter","text_es":"Pedro"}},
        {"action":"create_custom_entry","status":"applied","custom_key":"D2","definition":{"text_en":"Andrew","text_es":"Andrés"}},
        {"action":"create_custom_entry","status":"applied","reviewer":"r","custom_key":"D3","definition":{"text_en":"Titus","text_es":""}},
        {"action":"needs_manual_review","status":"needs_manual_review","reviewer":"r","new_strong":"D4"},
        {"action":"upsert_custom_definition","status":"applied","reviewer":"claude-delitzsch-review","strong":"D6","definition":{"text_en":"in you","text_es":"en ti"}},
        {"action":"create_custom_entry","status":"applied","reviewer":"rule:style_only_prefix_v5","custom_key":"D7","definition":{"text_en":"Mark","text_es":"Marcos"}}]
    (tmp_path/"acts.jsonl").write_text("".join(json.dumps(row)+"\n" for row in rows))
    ledger=load_ledger(tmp_path)
    imported={"text_es":"Pedro","review_status":"imported"}
    entry=lambda en,es:{"definitions":[{"text_en":en,"text_es":es,"order":1},imported]}
    assert publication("D1",entry("Peter","Pedro"),ledger)=={"status":"approved","rule":"reviewed_definition_decision","rule_version":1,"evidence":["acts.jsonl:1 r"]}
    assert publication("D2",entry("Andrew","Andrés"),ledger)["status"]=="draft"
    assert publication("D3",entry("Titus","Tito"),ledger)["evidence"]==["definition order 1 has no reviewed decision"]
    assert publication("D4",entry("x","y"),ledger)=={"status":"blocked","rule":"pending_manual_review","rule_version":1,"evidence":["acts.jsonl:4"]}
    assert publication("D5",{"definitions":[imported]},ledger)["status"]=="draft"
    assert publication("D6",entry("in you","en ti"),ledger)["evidence"]==["acts.jsonl:5 claude-delitzsch-review"]
    assert publication("D7",entry("Mark","Marcos"),ledger)["status"]=="draft"

def test_unapproved_custom_entries_are_unpublished_not_gaps(tmp_path):
    from scripts.delitzsch.definition_coverage import build_report, check_errors, encoded, occurrence_counts
    chapter=tmp_path/"jude"/"1.json"; chapter.parent.mkdir(parents=True)
    chapter.write_text(json.dumps([{"chapter":1,"verses":[{"verse":1,"words":[{"strong":s} for s in ["D1","D2","D2","D3"]]}]}]))
    defs=[{"text_en":"a","text_es":"b"}]
    sources={"words":{},"roots":{},"custom_definitions":{"D1":{"definitions":defs,"publication":{"status":"approved"}},
        "D2":{"definitions":defs,"publication":{"status":"draft"}},"D3":{"definitions":defs}}}
    report=build_report(occurrence_counts(tmp_path),sources)
    assert report["unpublished"]==[{"strong":"D2","status":"draft","occurrences":2}]
    assert report["missing_definitions"]=={"en":[],"es":[]}
    assert report["identifiers"]["D2"]["languages"]==[]
    assert check_errors(report,encoded(report),{"en":[],"es":[]})==["D3 has no valid publication status; run python -m scripts.delitzsch.entry_publication write"]

def test_committed_publication_status_is_current():
    from scripts.delitzsch.definition_coverage import occurrence_counts
    from scripts.delitzsch.entry_publication import CUSTOM, apply, load_ledger, referenced_custom_keys
    custom=json.loads(CUSTOM.read_text(encoding="utf-8"))
    assert apply(custom,referenced_custom_keys(custom,occurrence_counts()),load_ledger())==[]
