import json
import re
import shutil
import sqlite3
import zipfile

import pytest

from scripts.delitzsch.sqlite_loader import SQLiteLoader
from scripts.knowledge.core import ROOT, digest, read_json
from scripts.knowledge.corpus.__main__ import check, compare, regenerate
from scripts.knowledge.corpus.engine import (
    SNAPSHOTS,
    PinDrift,
    Snapshot,
    input_digest,
    new_tally,
    newest_snapshot,
    pin,
    render,
)
from scripts.knowledge.corpus.families import Reason
from scripts.knowledge.validate import Validator

FIXTURE = ROOT / "tests/fixtures/knowledge/corpus"


@pytest.fixture
def corpus(tmp_path):
    root = tmp_path / "checkout"
    for path in ("contracts/biblical-knowledge/v1", "data/knowledge/registries"):
        shutil.copytree(ROOT / path, root / path)
    shutil.copytree(FIXTURE / "data", root / "data", dirs_exist_ok=True)
    shutil.copytree(FIXTURE / "snapshot", root / SNAPSHOTS / "fixture")
    shaul = tmp_path / "shaul"
    shutil.copytree(FIXTURE / "shaul", shaul)
    return root, {"shaul": shaul}


def run(root, roots, pins=None):
    snap = Snapshot.load(root, "fixture", roots)
    shards = {}
    files = regenerate(
        root,
        snap,
        pins or pin(root, snap, "fixture-revision", roots),
        roots,
        shards.__setitem__,
    )
    return shards, {path: json.loads(data) for path, data in files.items()}


def test_every_included_record_is_normalized_or_unresolved(corpus):
    _, files = run(*corpus)
    coverage = files["reports/coverage.json"]
    counts = {f["id"]: f for f in coverage["families"] if "units" in f}
    assert all(f["units"] == f["normalized"] + f["unresolved"] for f in counts.values())
    assert counts["oe"]["normalized"] == 2 and counts["oe"]["inputs"] == 1
    assert counts["bes"]["unresolved"] == 1
    assert counts["shaul-knowledge"]["units"] == 7
    assert {f["disposition"] for f in coverage["families"]} == {
        "included",
        "deferred",
        "restricted",
    }
    unresolved = files["reports/unresolved.json"]
    assert unresolved["units_by_reason"] == {
        Reason.CONTAINS_HOST_PATH: 1,
        Reason.CONTEXTUAL_RELATION_REQUIRES_SCOPE: 1,
        Reason.EMPTY_TEXT: 1,
        Reason.ENDPOINT_OUTSIDE_CONTRACT: 1,
        Reason.ENTITY_KIND_OUTSIDE_CONTRACT: 1,
    }
    assert unresolved["references_by_reason"][Reason.DANGLING_TARGET] == 2
    assert files["reports/validation.json"]["status"] == "passed"


def test_repeated_generation_is_byte_identical(corpus):
    first, files = run(*corpus)
    second, again = run(*corpus)
    assert first == second and files == again
    listed = {f["path"]: f["sha256"] for f in files["manifest.json"]["files"]}
    assert listed == {p: digest(d) for p, d in first.items() if p != "manifest.json"}


def test_verified_mappings_only(corpus):
    shards, _ = run(*corpus)
    oe = json.loads(shards["records/oe/daniel/7.json"])
    status = {
        p["native_reference"]["verse_label"]: p["mapping"]["status"]
        for p in oe["passages"]
    }
    assert status == {"13": "mapped", "14": "unresolved"}
    assert {p["language"] for p in oe["passages"]} == {"arc"}


def test_withheld_and_private_content_never_reaches_artifacts(corpus):
    shards, files = run(*corpus)
    delitzsch = json.loads(shards["records/delitzsch-text/john/1.json"])
    assert all(
        not t["lexical_refs"] and not t["annotations"] for t in delitzsch["tokens"]
    )
    source = read_json(corpus[0] / "data/delitzsch/parsed/john/1.json")[0]["verses"]
    assert all("/" in v["hebrew"] for v in source)
    assert sorted(p["text"] for p in delitzsch["passages"]) == sorted(
        v["hebrew"].replace("/", "") for v in source
    )
    assert "/" not in "".join(t["text"] for t in delitzsch["tokens"])
    shaul = shards["records/shaul.json"].decode()
    note = next(e for e in json.loads(shaul)["evidence"] if e["kind"] == "note")
    assert note["content"]["sections"] and all(
        len(s["sha256"]) == 64 for s in note["content"]["sections"]
    )
    body = (
        corpus[1]["shaul"] / "content/besorah/juan_1_testigo_cordero.md"
    ).read_text()
    sentence = body.split("\n## ", 2)[1].splitlines()[2]
    assert sentence.strip() and sentence not in shaul
    everything = b"".join(
        d for p, d in shards.items() if p.startswith("records/")
    ).decode()
    assert "private/" not in everything and "data/tth" not in everything
    assert "/Users/" not in everything
    assert all(
        not i["path"].startswith(("private/", "data/tth"))
        for i in files["manifest.json"]["inputs"]
    )


@pytest.mark.parametrize(
    "path, change, message",
    [
        (
            "data/oe/daniel/7.json",
            lambda v: v[0]["words"][0].update(morph="X"),
            "language marker",
        ),
        (
            "data/oe/daniel/7.json",
            lambda v: v[0].update(chapter=8),
            "differs from its file",
        ),
        (
            "data/greek/books/john/1.json",
            lambda v: v["verses"][0]["words"][0].update(position=9),
            "position",
        ),
        (
            "data/bes/json/genesis.json",
            lambda v: v["chapters"][0]["verses"].append(
                dict(v["chapters"][0]["verses"][1], bes="Otra lectura.")
            ),
            "Native reference repeated: bes-es:genesis:1:2",
        ),
        (
            "data/bes/json/genesis.json",
            lambda v: v["chapters"].append(v["chapters"][0]),
            "Native reference repeated: bes-es:genesis:1:",
        ),
        (
            "data/bes/json/genesis.json",
            lambda v: v["chapters"][0].update(
                notes=[{"verse": 4, "bes": "Fuera del recorrido.", "footnotes": []}]
            ),
            "holds 4 source records but 3 were read",
        ),
        (
            "data/delitzsch/parsed/john/1.json",
            lambda v: v[0]["verses"][1].update(words=[]),
            "Delitzsch verse has no words",
        ),
        (
            "data/delitzsch/parsed/john/1.json",
            lambda v: v[0]["verses"][0]["words"][1].update(text="הָיְתָה"),
            "Delitzsch words differ from the verse text",
        ),
    ],
)
def test_malformed_input_fails_validation(corpus, path, change, message):
    root, roots = corpus
    value = read_json(root / path)
    change(value)
    (root / path).write_text(json.dumps(value, ensure_ascii=False))
    with pytest.raises(ValueError, match=message):
        run(root, roots)


def write_words(root, change):
    path = root / "data/dict/lexicon/words.json"
    words = read_json(path)
    change(words["H606"])
    path.write_text(json.dumps(words, ensure_ascii=False))


def test_pins_follow_what_the_corpus_reads(corpus):
    root, roots = corpus
    committed_fixture(root, roots)
    write_words(root, lambda entry: entry.update(definitions=["changed"]))
    check(root, "fixture", roots)
    write_words(root, lambda entry: entry.update(lemma="changed"))
    with pytest.raises(ValueError, match="stale"):
        check(root, "fixture", roots)


def test_shaul_drift_and_unpinned_files_fail(corpus):
    root, roots = corpus
    snap = Snapshot.load(root, "fixture", roots)
    pins = pin(root, snap, "fixture-revision", roots)
    note = roots["shaul"] / "content/besorah/juan_1_testigo_cordero.md"
    note.write_text(note.read_text() + "\n")
    with pytest.raises(PinDrift, match="juan_1_testigo_cordero.md"):
        run(root, roots, pins)
    pins = pin(root, snap, "fixture-revision", roots)
    (roots["shaul"] / "knowledge/concepts/new.yml").write_text(
        "id: new\ntype: concept\n"
    )
    with pytest.raises(PinDrift, match="unpinned"):
        run(root, roots, pins)


@pytest.mark.parametrize(
    "origin, path, message",
    [
        ("davar", "data/greek/lxx/genesis.json", "without a disposition: davar:data/greek/lxx"),
        ("davar", "data/oe/daniel/notes.txt", "without a disposition: davar:data/oe/daniel"),
        ("shaul", "content/estudios/ruth.md", "without a disposition: shaul:content/estudios"),
        ("shaul", "knowledge/concepts/new.yaml", "without a disposition: shaul:knowledge"),
        ("davar", "data/dict/lexicon/.DS_Store", None),
    ],
)
def test_every_source_file_needs_a_disposition(corpus, origin, path, message):
    root, roots = corpus
    target = (root if origin == "davar" else roots["shaul"]) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("{}")
    if message is None:
        Snapshot.load(root, "fixture", roots)
        return
    with pytest.raises(ValueError, match=message):
        Snapshot.load(root, "fixture", roots)


def test_a_source_file_with_two_dispositions_fails(corpus):
    root, roots = corpus
    path = root / SNAPSHOTS / "fixture/inventory.json"
    inventory = read_json(path)
    inventory["not_sources"].append({"paths": ["data/oe/**"], "reason": "Overlap."})
    path.write_text(json.dumps(inventory))
    with pytest.raises(ValueError, match="several dispositions: davar:data/oe/daniel/7.json"):
        Snapshot.load(root, "fixture", roots)


@pytest.mark.parametrize(
    "change, message",
    [
        (lambda f: f[0].update(disposition="restricted"), "include rule"),
        (lambda f: f[1].update(evidence=["docs/missing.md"]), "evidence"),
        (
            lambda f: f[2].update(evidence=["data/delitzsch/parsed/john/1.json:99999"]),
            "outside file",
        ),
        (lambda f: f[9]["include"].update(root="private"), "public root"),
        (lambda f: f[11].update(paths=[]), "path patterns"),
    ],
)
def test_inventory_rejects_invalid_rows(corpus, change, message):
    root, _ = corpus
    path = root / SNAPSHOTS / "fixture/inventory.json"
    inventory = read_json(path)
    change(inventory["families"])
    path.write_text(json.dumps(inventory))
    with pytest.raises(ValueError, match=message):
        Snapshot.load(root, "fixture")


def committed_fixture(root, roots, name="fixture"):
    snap = Snapshot.load(root, name, roots)
    files = regenerate(root, snap, pin(root, snap, "fixture-revision", roots), roots)
    for path, data in files.items():
        target = root / SNAPSHOTS / name / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def test_check_detects_stale_snapshot_and_compare_names_changes(corpus):
    root, roots = corpus
    committed_fixture(root, roots)
    check(root, "fixture", roots)
    shutil.copytree(root / SNAPSHOTS / "fixture", root / SNAPSHOTS / "next")
    inventory_path = root / SNAPSHOTS / "next/inventory.json"
    inventory = read_json(inventory_path)
    inventory["snapshot"] = "next"
    inventory_path.write_text(json.dumps(inventory))
    for name in ("manifest.json", "reports/coverage.json"):
        (root / SNAPSHOTS / "next" / name).unlink()
    write_words(root, lambda entry: entry.update(lemma="changed"))
    with pytest.raises(ValueError, match="records/hebrew-lexicon/words.json"):
        check(root, "fixture", roots)
    committed_fixture(root, roots, "next")
    diff = compare(root, "fixture", "next")
    assert diff["inputs"]["changed"] == ["data/dict/lexicon/words.json"]
    assert diff["artifacts"]["changed"][0] == "records/hebrew-lexicon/words.json"
    (root / SNAPSHOTS / "next/reports/unresolved.json").write_text("{}")
    with pytest.raises(ValueError, match="stale"):
        check(root, "next", roots)


def test_newest_snapshot_matches_current_davar_sources():
    name = newest_snapshot(ROOT)
    snap = Snapshot.load(ROOT, name)
    manifest = read_json(ROOT / SNAPSHOTS / name / "manifest.json")
    assert input_digest(snap, manifest["inputs"]) == manifest["input_manifest_digest"]
    davar = {f.id for f in snap.included() if f.origin == "davar"}
    expected = {
        f["path"]: f["sha256"]
        for f in manifest["files"]
        if f["path"].split("/")[1] in davar
    }
    sampled, actual = {}, {}
    for path, data in render(
        ROOT,
        snap,
        manifest["inputs"],
        {},
        new_tally(snap),
        select=davar,
        schema=False,
    ):
        actual[path] = digest(data)
        sampled.setdefault(path.split("/")[1], data)
    stale = sorted(p for p in expected.keys() | actual.keys() if expected.get(p) != actual.get(p))
    assert not stale, f"Snapshot {name} is stale; create a new snapshot: {stale[:10]}"
    validator = Validator(ROOT)
    for data in sampled.values():
        validator.records(json.loads(data), public=True)
    assert not any(
        i["path"].startswith(("private/", "data/tth", "data/dss"))
        for i in manifest["inputs"]
    )


def dhnt_verses():
    with zipfile.ZipFile(ROOT / "data/delitzsch/raw/DHNT'85+.zip") as archive:
        module = archive.read(".SQLite3")
    db = sqlite3.connect(":memory:")
    db.deserialize(module)
    books = SQLiteLoader.BOOK_MAPPINGS
    return {
        (books[number], chapter, verse): re.sub(r"<S>[^<]*</S>", "", text)
        for number, chapter, verse, text in db.execute(
            "select book_number, chapter, verse, text from verses"
        )
        if number in books
    }




def test_delitzsch_passage_text_reproduces_the_dhnt_module():
    module = dhnt_verses()
    snap = Snapshot.load(ROOT, newest_snapshot(ROOT))
    manifest = read_json(ROOT / SNAPSHOTS / snap.name / "manifest.json")
    pins = [i for i in manifest["inputs"] if i["id"].startswith("delitzsch-text/")]
    passages = {}
    for _, data in render(
        ROOT, snap, pins, {}, new_tally(snap), select={"delitzsch-text"}, schema=False
    ):
        for p in json.loads(data)["passages"]:
            native = p["native_reference"]
            key = (p["book_id"], native["chapter"], int(native["verse_label"]))
            passages[key] = p["text"]
    assert len(passages) == 7956
    printed = {key: module[key].replace("־ ", "־").strip() for key in passages}
    assert printed == passages
