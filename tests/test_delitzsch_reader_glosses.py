import json
import xml.etree.ElementTree as ET
from collections import defaultdict
from functools import cache
from pathlib import Path

import pytest

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


@cache
def occurrences():
    found = defaultdict(list)
    for path in sorted((ROOT / "data/delitzsch/parsed").glob("*/*.json")):
        for chapter in json.loads(path.read_text(encoding="utf-8")):
            for verse in chapter["verses"]:
                for index, word in enumerate(verse["words"]):
                    if word.get("strong"):
                        found[word["strong"].split("/")[-1]].append(f"{path.parent.name}.{chapter['chapter']}.{verse['verse']}.{index}")
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
])
def test_a_reviewed_occurrence_shows_the_sense_the_pull_request_names(location, strong, english, spanish):
    shown = glosses_at(*location)
    assert (shown[0], shown[1].startswith(english), shown[2].startswith(spanish)) == (strong, True, True), shown
