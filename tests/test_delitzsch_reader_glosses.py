import json
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from difflib import SequenceMatcher
from functools import cache
from pathlib import Path

import pytest

from scripts.delitzsch.review.blocked_candidates import greek_verse
from scripts.dict.reader_gloss import Lexicon

ROOT = Path(__file__).resolve().parents[1]
NAMES = {
    "H3442": "Jesus", "H3068": "The One who was", "H3389": "Jerusalem", "H3478": "Israel", "H4872": "Moses", "H3290": "Jacob",
    "H7586": "Saul", "H4714": "Egypt", "H3327": "Isaac", "H3878": "Levi", "H3383": "Jordan", "H3305": "Joppa", "H6721": "Sidôn",
    "H894": "Babel", "H8111": "Samaria", "H6865": "Tyre", "H8118": "Samaritan", "H3063": "Judah", "H5467": "Sodom",
    "H1176": "Baal-zebub/Beelzebub", "H5680": "Hebrew", "H5146": "Noah", "H3405": "Jericho", "H3448": "Jesse", "H175": "Aaron",
    "H6017": "Gomorrah", "H8012": "Salmon", "H5514": "Sinai", "H3850": "Lydda", "H4287": "Mahath", "H8050": "Samuel", "H3141": "Joram",
    "H1109": "Balaam", "H5210": "Nineveh", "H2140": "Zacchaeus", "H2216": "Zerubbabel", "H5177": "Nahshon", "H4519": "Manasseh",
    "H2074": "Zebulun", "H5321": "Naphtali", "H758": "Aram", "H763": "Mesopotamia", "H2771": "Haran", "H1904": "Hagar", "H6215": "Esau",
    "H4317": "Michael", "H836": "Asher", "H7410": "Ram", "H7018": "Cainan/Kenan", "H7346": "Rehoboam", "H3169": "Hezekiah", "H526": "Amon",
    "H3204": "Jeconiah", "H3414": "Jeremiah", "H6578": "Euphrates", "H4074": "Medes", "H5867": "Elam", "H5910": "Acco", "H3778": "Chaldean",
    "H3568": "Cush", "H795": "Ashdod", "H8289": "Sharon", "H1439": "Gideon", "H8123": "Samson", "H3316": "Jephthah", "H347": "Job",
    "H669": "Ephraim", "H6939": "Kidron", "H2584": "Anna", "H3195": "Iturea", "H531": "Amoz/Amos", "H4992": "Mattatha", "H5416": "Nathan",
    "H8286": "Serug", "H775": "Arphaxad", "H6005": "Immanuēl", "H4023": "Megiddon", "H348": "Jezebel", "H7205": "Reuben",
    "H3485": "Issachar", "H7259": "Rebekah",
}
HEBREW_SOUNDS = dict(zip("בגדזטכלמנספצקרשתךםןףץ", "BGDSTKLMNSPSKRSTKMNPS"))
GREEK_SOUNDS = dict(zip("βγδζθκλμνξπρσςτφχψ", ["B", "G", "D", "S", "T", "K", "L", "M", "N", "KS", "P", "R", "S", "S", "T", "P", "K", "PS"]))
FINAL_LETTERS = str.maketrans("ךםןףץ", "כמנפצ")
GREEK_NAMES_FOR = {
    "H3068": {"κυριος", "θεος"}, "H4714": {"αιγυπτος", "αιγυπτιος"}, "H6865": {"τυρος", "τυριος"}, "H763": {"μεσοποταμια"},
    "H758": {"μεσοποταμια", "συρια", "συρος"}, "H5910": {"πτολεμαις"}, "H3568": {"αιθιοψ"}, "H795": {"αζωτος"},
    "H6939": {"κεδρων"}, "H5680": {"εβραιος", "εβραις", "εβραιστι"},
}


@cache
def corpus():
    found = []
    for path in sorted((ROOT / "data/delitzsch/parsed").glob("*/*.json")):
        for chapter in json.loads(path.read_text(encoding="utf-8")):
            for verse in chapter["verses"]:
                for index, word in enumerate(verse["words"]):
                    if word.get("strong"):
                        found.append(((path.parent.name, chapter["chapter"], verse["verse"], index), word))
    return found


@cache
def occurrences():
    found = defaultdict(list)
    for location, word in corpus():
        found[word["strong"].split("/")[-1]].append(".".join(map(str, location)))
    return found


@cache
def lexicon():
    return Lexicon()


@cache
def proper_nouns():
    root = ET.parse(ROOT / "data/dict/raw/HebrewStrong.xml").getroot()
    entries = [e for e in root.iter() if e.tag.endswith("entry") and e.get("id")]
    return {e.get("id") for e in entries if any(w.tag.endswith("w") and (w.get("pos") or "").startswith("n-pr") for w in e[:1])}


def glosses_at(book, chapter, verse, index):
    verses = json.loads((ROOT / f"data/delitzsch/parsed/{book}/{chapter}.json").read_text(encoding="utf-8"))[0]["verses"]
    strong = next(v for v in verses if v["verse"] == verse)["words"][index]["strong"].split("/")[-1]
    english, spanish = lexicon().glosses(strong)
    return strong, english.text, spanish.text


def test_every_new_testament_occurrence_shows_an_english_and_spanish_first_gloss_from_one_record():
    empty, split = {}, {}
    for strong, locations in occurrences().items():
        english, spanish = lexicon().glosses(strong) or (None, None)
        if not (english and spanish):
            empty[strong] = locations[:3]
        elif english.definition is not spanish.definition:
            split[strong] = (english.text, spanish.text)
    assert (empty, split) == ({}, {})


def test_every_new_testament_occurrence_of_a_proper_noun_entry_shows_its_name_first():
    shown = {strong: lexicon().glosses(strong)[0].text for strong in occurrences() if strong in proper_nouns()}
    assert set(shown) == set(NAMES)
    assert {strong: text for strong, text in shown.items() if not text.startswith(NAMES[strong])} == {}


@pytest.mark.parametrize("location, strong, english, spanish", [
    (("peter1", 1, 6, 10), "D0726", "different;", "diferente;"),
    (("john", 11, 13, 9), "H8142", "sleep", "sueño"),
    (("mark", 12, 19, 13), "D0728", "marry a dead brother's widow;", "casarse con la viuda"),
    (("romans", 16, 1, 8), "D0402", "serve, minister;", "servir, ministrar;"),
    (("romans", 16, 1, 9), "H6951", "assembly", "asamblea"),
    (("luke", 1, 13, 16), "D0708", "John;", "Juan;"),
    (("luke", 1, 13, 7), "H8085", "hear", "oír"),
    (("mark", 1, 9, 5), "D0773", "Nazareth;", "Nazaret;"),
    (("james", 1, 1, 0), "D0795", "James;", "Santiago;"),
    (("mark", 1, 9, 0), "H1961", "be; become", "ser; llegar a ser"),
    (("mark", 12, 19, 8), "H5800", "leave;", "dejar;"),
    (("luke", 3, 25, 5), "D0902", "Nahum; an ancestor", "Nahúm; un antepasado"),
    (("luke", 3, 29, 1), "D0906", "Jose; an ancestor", "Yosé; un antepasado"),
    (("acts", 8, 5, 0), "D0903", "Philip; the evangelist", "Felipe; el evangelista"),
    (("luke", 3, 1, 17), "D0904", "Philip; the tetrarch", "Felipe; el tetrarca"),
    (("mark", 6, 17, 13), "D0905", "Philip; a son of Herod", "Felipe; un hijo de Herodes"),
    (("john", 1, 43, 8), "D0069", "Philip; disciple", "Felipe;"),
    (("philippians", 1, 18, 10), "H5046", "tell, declare", "contar, declarar"),
    (("matthew", 20, 1, 8), "H7925", "rise early;", "madrugar;"),
    (("luke", 17, 10, 18), "H5190", "lift, bear; lay upon", "levantar, llevar; imponer"),
    (("john3", 1, 1, 2), "D0057", "Gaius; a name borne by believers", "Gayo; nombre de creyentes"),
    (("corinthians1", 1, 16, 6), "D0907", "Stephanas;", "Estéfanas;"),
    (("revelation", 18, 13, 10), "H4735", "cattle", "ganado"),
    (("hebrews", 6, 8, 4), "D0908", "reject, despise;", "rechazar, despreciar;"),
    (("john", 12, 28, 1), "D0909", "glorify, honour;", "glorificar, honrar;"),
    (("john", 12, 28, 10), "D0909", "glorify, honour;", "glorificar, honrar;"),
    (("john1", 2, 3, 3), "D0910", "recognize, know", "reconocer, conocer"),
    (("hebrews", 5, 14, 3), "D0911", "solid, firm;", "sólido, firme;"),
    (("revelation", 2, 14, 13), "H3384", "throw, shoot; in the hiphil, teach", "arrojar, disparar; en hifil, enseñar"),
    (("james", 5, 7, 18), "H3138", "early rain", "lluvia temprana"),
    (("philippians", 1, 27, 1), "H5090", "drive, lead, guide; in later Hebrew", "conducir, guiar, llevar; en hebreo posterior"),
    (("mark", 7, 5, 7), "H5090", "drive, lead, guide; in later Hebrew, manage, govern, practise, be the custom", "conducir, guiar"),
    (("corinthians1", 5, 13, 5), "H1197", "burn, kindle, consume; remove, purge, put away", "arder, encender, consumir; quitar, purgar"),
    (("mark", 12, 34, 14), "H6148", "be surety, pledge; with the heart, dare", "ser fiador, dar en prenda; con el corazón, atreverse"),
    (("acts", 16, 7, 8), "H3240", "lay down; place; leave; let, allow", "poner; colocar; dejar; permitir"),
    (("john", 6, 19, 8), "D0912", "ris; a stadium", "ris; un estadio"),
    (("luke", 19, 30, 18), "H5425", "be free", "ser libre"),
])
def test_a_reviewed_occurrence_shows_the_sense_the_pull_request_names(location, strong, english, spanish):
    shown = glosses_at(*location)
    assert (shown[0], shown[1].startswith(english), shown[2].startswith(spanish)) == (strong, True, True), shown


def unaccented(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c)).lower()


def squeezed(sounds):
    return "".join(sound for index, sound in enumerate(sounds) if not index or sound != sounds[index - 1])


def hebrew_sounds(text):
    return squeezed("".join(HEBREW_SOUNDS.get(c, "") for c in unicodedata.normalize("NFD", text)))


def greek_sounds(lemma):
    text = unaccented(lemma)
    return squeezed("".join(GREEK_SOUNDS.get(c, "") for c in (text[:-1] if text.endswith("ς") and len(text) > 3 else text)))


def consonants(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if "א" <= c <= "ת" and c not in "וי").translate(FINAL_LETTERS)


def spelled_as_lemma(word, lemma):
    text, target, prefixes = consonants(word["text"]), consonants(lemma), len(word.get("prefixes") or [])
    while prefixes and text[:1] in "והבלכמש" and text != target:
        text, prefixes = text[1:], prefixes - 1
    return text == target


def test_every_new_testament_occurrence_of_a_proper_noun_entry_matches_a_name_in_its_greek_verse():
    greek_cache, unmatched = {}, []
    for (book, chapter, verse, index), word in corpus():
        strong = word["strong"].split("/")[-1]
        if strong not in proper_nouns():
            continue
        lemma = (lexicon().words.get(strong) or lexicon().roots.get(strong))["lemma"]
        greek = {unaccented(w["lemma"]): w["lemma"] for w in greek_verse(book, chapter, verse, greek_cache)}
        names = [plain for plain, original in greek.items() if original[:1].isupper()]
        if any(SequenceMatcher(None, hebrew_sounds(lemma), greek_sounds(name)).ratio() >= 0.66 for name in names):
            continue
        if GREEK_NAMES_FOR.get(strong, set()) & greek.keys() or spelled_as_lemma(word, lemma):
            continue
        unmatched.append((f"{book} {chapter}:{verse}.{index}", word["text"], strong, lemma))
    assert unmatched == []


def test_every_custom_record_the_review_adds_to_a_bdb_entry_was_checked_against_the_old_testament_and_every_new_testament_use():
    added = {
        decision["strong"]
        for path in sorted((ROOT / "data/delitzsch/review/batches").glob("definition_gaps_42*.json"))
        for decision in json.loads(path.read_text(encoding="utf-8"))["decisions"]
        if decision["action"] == "upsert_custom_definition" and decision["strong"].startswith("H") and decision["definition"].get("source") == "custom"
    }
    table = {row["strong"]: row for row in json.loads((ROOT / "data/delitzsch/review/h_entry_custom_records.json").read_text(encoding="utf-8"))["records"]}
    shown = {strong: lexicon().glosses(strong) for strong in added}
    assert set(table) == added
    assert {strong: (row["text_en"], row["text_es"]) for strong, row in table.items()} == {strong: (en.text, es.text) for strong, (en, es) in shown.items()}
    assert {strong for strong, row in table.items() if not row["ot_check"].startswith("fits: ")} == set()
    assert {strong for strong in added if not occurrences().get(strong)} == set()
    assert {strong for strong, row in table.items() if not row["nt_check"].startswith("fits: ")} == set()
    assert {strong: row["nt_occurrences"] for strong, row in table.items()} == {strong: sorted(occurrences()[strong]) for strong in table}


def test_every_instances_only_entry_lists_exactly_its_new_testament_occurrences():
    differing = {}
    for strong, entry in lexicon().custom.items():
        if entry.get("mapping_scope") == "instances_only":
            listed = sorted(f"{x['book']}.{int(x['chapter'])}.{int(x['verse'])}.{int(x['word_index'])}" for x in entry.get("nt_instances") or [])
            if listed != sorted(occurrences().get(strong, [])):
                differing[strong] = (len(listed), len(occurrences().get(strong, [])))
    assert differing == {}


def review_table(name):
    return json.loads((ROOT / f"data/delitzsch/review/{name}.json").read_text(encoding="utf-8"))


def greek_lemmas(book, chapter, verse, greek_cache):
    return {unaccented(w["lemma"]) for w in greek_verse(book, chapter, verse, greek_cache)}


def name_entries():
    not_names = review_table("name_entry_referents")["not_names"]
    return {strong for strong in occurrences() if strong.startswith("D") and lexicon().glosses(strong)[0].text[:1].isupper() and strong not in not_names}


def exception_holds(exception, wanted, book, chapter, verse, greek_cache):
    if exception["kind"] == "no_verse":
        return not greek_verse(book, chapter, verse, greek_cache)
    if exception["kind"] == "boundary":
        return bool(wanted & (greek_lemmas(book, chapter, verse - 1, greek_cache) | greek_lemmas(book, chapter, verse + 1, greek_cache)))
    return exception["kind"] in ("tr", "pronoun", "rendering", "source_gap") and bool(exception["note"])


def test_every_name_entry_occurrence_renders_one_of_its_greek_names_or_is_a_reviewed_exception():
    table, greek_cache, unmatched, wrong_exception = review_table("name_entry_referents"), {}, [], []
    assert set(table["entries"]) == name_entries()
    for strong, names in table["entries"].items():
        wanted = {unaccented(name) for name in names}
        for location in occurrences()[strong]:
            book, chapter, verse, _ = location.split(".")
            chapter, verse = int(chapter), int(verse)
            exception = table["exceptions"].get(location)
            if exception:
                if exception["strong"] != strong or not exception_holds(exception, wanted, book, chapter, verse, greek_cache):
                    wrong_exception.append(location)
            elif not wanted & greek_lemmas(book, chapter, verse, greek_cache):
                unmatched.append((location, strong, lexicon().glosses(strong)[0].text[:40]))
    assert unmatched == []
    assert wrong_exception == []
    assert {location for location, exception in table["exceptions"].items() if location not in occurrences()[exception["strong"]]} == set()


def test_entries_that_share_a_greek_name_name_one_referent_or_split_its_bearers_by_verse():
    table = review_table("name_entry_referents")
    sharing = defaultdict(set)
    for strong, names in table["entries"].items():
        for name in names:
            sharing[unaccented(name)].add(strong)
    reviewed = [set(group["entries"]) for group in table["same_referent"]] + [set(group) for group in table["distinct_referents"].values()]
    assert [sorted(group) for group in sharing.values() if len(group) > 1 and not any(group <= known for known in reviewed)] == []
    for name, bearers in table["distinct_referents"].items():
        assert {strong for strong in bearers if unaccented(name) not in {unaccented(n) for n in table["entries"][strong]}} == set()
        verses = {strong: {".".join(location.split(".")[:3]) for location in occurrences()[strong]} for strong in bearers}
        assert verses == {strong: set(listed) for strong, listed in bearers.items()}
        assert [(a, b) for a in bearers for b in bearers if a < b and verses[a] & verses[b]] == []


def reviewed_moves():
    moved = set()
    for name in ("definition_gaps_42_round_5", "definition_gaps_42_round_7", "definition_gaps_42_round_8"):
        decisions = json.loads((ROOT / f"data/delitzsch/review/batches/{name}.json").read_text(encoding="utf-8"))["decisions"]
        created = {d["strong"] for d in decisions if d["action"] == "upsert_custom_definition" and d.get("mapping_scope")}
        for d in decisions:
            if d["action"] == "set_strong" and d["new_strong"].split("/")[-1] not in created:
                o = d["occurrence"]
                moved.add(f"{o['book']}.{o['chapter']}.{o['verse']}.{o['word_index']}")
    return moved


def test_every_round_5_7_and_8_move_onto_an_existing_entry_was_reviewed_against_the_gloss_the_reader_shows():
    current = {".".join(map(str, location)): word["strong"].split("/")[-1] for location, word in corpus()}
    rows = {row["location"]: row for row in review_table("move_gloss_review")["moves"]}
    assert set(rows) == reviewed_moves()
    assert {loc: (row["strong"], row["shown"]) for loc, row in rows.items()} == {loc: (current[loc], lexicon().glosses(current[loc])[0].text) for loc in rows}
    assert {loc for loc, row in rows.items() if not row["verdict"].startswith(("fits: ", "fixed in round 7: "))} == set()
