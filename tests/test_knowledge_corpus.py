import json
import shutil

import pytest

from scripts.knowledge.core import ROOT, digest, read_json
from scripts.knowledge.corpus.__main__ import check, compare, regenerate
from scripts.knowledge.corpus.engine import SNAPSHOTS, PinDrift, Snapshot, discover, pin
from scripts.knowledge.corpus.families import Reason

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
    snap = Snapshot.load(root, "fixture")
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
    ],
)
def test_malformed_input_fails_validation(corpus, path, change, message):
    root, roots = corpus
    value = read_json(root / path)
    change(value)
    (root / path).write_text(json.dumps(value, ensure_ascii=False))
    with pytest.raises(ValueError, match=message):
        run(root, roots)


def test_pin_drift_and_unpinned_files_fail(corpus):
    root, roots = corpus
    snap = Snapshot.load(root, "fixture")
    pins = pin(root, snap, "fixture-revision", roots)
    (root / "data/dict/lexicon/words.json").write_text("{}")
    with pytest.raises(PinDrift, match="words.json"):
        run(root, roots, pins)
    pins = pin(root, snap, "fixture-revision", roots)
    (roots["shaul"] / "knowledge/concepts/new.yml").write_text(
        "id: new\ntype: concept\n"
    )
    with pytest.raises(PinDrift, match="unpinned"):
        run(root, roots, pins)


def test_inventory_requires_a_disposition_for_every_source_directory(corpus):
    root, _ = corpus
    (root / "data/lxx").mkdir()
    (root / "data/lxx/genesis.json").write_text("[]")
    with pytest.raises(ValueError, match="data/lxx"):
        Snapshot.load(root, "fixture")


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
    snap = Snapshot.load(root, name)
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
    words = read_json(root / "data/dict/lexicon/words.json")
    words["H606"]["lemma"] = "changed"
    (root / "data/dict/lexicon/words.json").write_text(
        json.dumps(words, ensure_ascii=False)
    )
    with pytest.raises(PinDrift):
        check(root, "fixture", roots)
    committed_fixture(root, roots, "next")
    diff = compare(root, "fixture", "next")
    assert diff["inputs"]["changed"] == ["data/dict/lexicon/words.json"]
    assert diff["artifacts"]["changed"][0] == "records/hebrew-lexicon/words.json"
    (root / SNAPSHOTS / "next/reports/unresolved.json").write_text("{}")
    with pytest.raises(ValueError, match="stale"):
        check(root, "next", roots)


def test_committed_v1_snapshot_pins_current_davar_sources():
    snap = Snapshot.load(ROOT, "v1")
    manifest = read_json(ROOT / SNAPSHOTS / "v1/manifest.json")
    davar = [i for i in manifest["inputs"] if i["owner"] == "davar"]
    assert all(digest((ROOT / i["path"]).read_bytes()) == i["sha256"] for i in davar)
    for family in snap.included():
        if family.include.origin == "davar":
            found = discover(ROOT / family.include.root, family.include)
            pinned = sorted(
                i["id"].split("/", 1)[1]
                for i in davar
                if i["id"].startswith(family.id + "/")
            )
            assert found == pinned, family.id
    assert {i["owner"] for i in manifest["inputs"]} == {"davar", "shaul"}
    assert not any(
        i["path"].startswith(("private/", "data/tth", "data/dss"))
        for i in manifest["inputs"]
    )
