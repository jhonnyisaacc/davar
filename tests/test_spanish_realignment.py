import json
from pathlib import Path

import pytest

from scripts.dict.spanish_realignment import shifted_runs

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
