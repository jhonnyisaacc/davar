from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.books import load_books
from scripts.relationships import candidates as lever

APPROVAL = {"status": "approved", "reviewer": {"name": "Reviewer"}, "reviewed_on": "2026-11-16"}


def _catalog(tmp_path: Path, relationships: list[dict]) -> Path:
    path = tmp_path / "catalog.json"
    path.write_text(
        json.dumps({"schema": lever.CATALOG_SCHEMA, "relationships": relationships}),
        encoding="utf-8",
    )
    return path


def _relationships(outputs: dict[Path, str], path: Path) -> dict[str, dict]:
    return {record["id"]: record for record in json.loads(outputs[path])["relationships"]}


def _candidates() -> list[dict]:
    return json.loads(lever.CANDIDATES.read_text(encoding="utf-8"))["candidates"]


def test_committed_outputs_reproduce():
    assert lever.main(["--check"]) == 0


def test_rerun_on_its_own_output_changes_nothing(tmp_path):
    first = lever.render(_catalog(tmp_path, []))
    catalog = tmp_path / "catalog.json"
    catalog.write_text(first[catalog], encoding="utf-8")
    assert lever.render(catalog) == first


def test_generated_records_are_unreviewed_and_recorded_reviews_survive(tmp_path):
    committed = json.loads(lever.CATALOG.read_text(encoding="utf-8"))["relationships"]
    reviews = {record["id"]: record["review"] for record in committed}
    empty = _catalog(tmp_path, [])
    generated = _relationships(lever.render(empty), empty)
    assert set(generated) == set(reviews)
    assert {record["review"]["status"] for record in generated.values()} == {"unreviewed"}
    reviewed = [
        {**record, "review": APPROVAL} if record["review"]["status"] == "unreviewed" else record
        for record in committed
    ]
    catalog = _catalog(tmp_path, reviewed)
    survived = _relationships(lever.render(catalog), catalog)
    assert {key: record["review"] for key, record in survived.items()} == {
        record["id"]: record["review"] for record in reviewed
    }


def test_reviewed_record_without_a_footnote_stops_the_run(tmp_path):
    committed = json.loads(lever.CATALOG.read_text(encoding="utf-8"))["relationships"][0]
    orphan = {**committed, "id": "g3056-h1697-john-1-2", "review": APPROVAL}
    with pytest.raises(SystemExit, match="g3056-h1697-john-1-2"):
        lever.render(_catalog(tmp_path, [orphan]))


def test_reviewed_record_whose_content_changed_stops_the_run(tmp_path):
    committed = json.loads(lever.CATALOG.read_text(encoding="utf-8"))["relationships"][0]
    edited = {
        **committed,
        "rationale": {"es": "Texto que el revisor nunca vio."},
        "review": APPROVAL,
    }
    with pytest.raises(SystemExit, match=f"{committed['id']}.*re-review"):
        lever.render(_catalog(tmp_path, [edited]))


def test_check_fails_on_stale_output_and_writes_nothing(tmp_path, monkeypatch, capsys):
    stale = tmp_path / "candidates.json"
    stale.write_text("{}\n", encoding="utf-8")
    monkeypatch.setattr(lever, "CANDIDATES", stale)
    assert lever.main(["--check"]) == 1
    assert capsys.readouterr().err.strip().endswith(f"{stale.parent.name}/candidates.json")
    assert stale.read_text(encoding="utf-8") == "{}\n"


def test_authored_records_pass_through_untouched(tmp_path):
    committed = json.loads(lever.CATALOG.read_text(encoding="utf-8"))["relationships"][0]
    authored = {
        **committed,
        "id": "authored-record",
        "provenance": {**committed["provenance"], "origin": "authored", "transformation": "imported"},
    }
    catalog = _catalog(tmp_path, [authored])
    assert _relationships(lever.render(catalog), catalog)["authored-record"] == authored


def test_every_greek_footnote_is_listed_and_only_capital_heb_pairs():
    listed = _candidates()
    assert len(listed) == len(lever.footnotes()) == 28
    kinds = {row["locator"]: row["kind"] for row in listed}
    assert kinds["Sodot 13:16, nota 136"] == "greek_only"
    arje = next(row for row in listed if row["locator"] == "Iojanán 8:25, nota 130")
    assert [pair["record_id"] for pair in arje["pairs"]] == [
        "g0746-h7225-john-8-25",
        "g0746-h7223-john-8-25",
    ]


def test_tanakh_greek_side_is_unchecked_not_guessed():
    ezekiel = next(row for row in _candidates() if row["locator"].startswith("Iejezkel"))
    checks = ezekiel["pairs"][0]["precheck"]
    assert checks["greek"]["status"] == "unchecked"
    assert checks["hebrew"]["status"] == "found"


@pytest.mark.parametrize("book", load_books(), ids=lambda book: book["id"])
def test_precheck_reads_every_book_in_each_corpus(book):
    note = lever.Footnote(
        path="",
        json_pointer="",
        tth_name=book["name"],
        book_id=book["id"],
        in_besorah=book["section"] == "besorah",
        chapter=1,
        verse=1,
        number="1",
        explanation="",
    )
    languages = ["greek", "hebrew"] if note.in_besorah else ["hebrew"]
    for language in languages:
        assert lever.precheck(note, language, "H0")["status"] == "absent"


def test_unknown_term_stops_the_run():
    terms = json.loads(lever.TERMS.read_text(encoding="utf-8"))
    del terms["greek"]["Logos"]
    with pytest.raises(SystemExit, match="Logos"):
        lever.build(lever.footnotes(), terms)
