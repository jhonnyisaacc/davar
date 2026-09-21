"""Configuration-only reuse, using real Genesis inputs and labeled synthetic Shaul records."""

import copy
import json
import shutil
import subprocess
import sys

import pytest
from jsonschema import ValidationError

from scripts.knowledge.adapters import public_note
from scripts.knowledge.build import artifacts, build, project
from scripts.knowledge.core import ROOT, digest, encoded, read_json, reference
from scripts.knowledge.profiles import DEFAULT_PROFILE, load_profile
from scripts.knowledge.validate import Validator

GENESIS = "tests/fixtures/knowledge/genesis/profile.json"


@pytest.fixture
def fixture_root(tmp_path):
    root = tmp_path / "checkout"
    for path in (
        "contracts/biblical-knowledge/v1",
        "data/knowledge/registries",
        "tests/fixtures/knowledge/genesis",
    ):
        shutil.copytree(ROOT / path, root / path)
    for path in ("data/oe/genesis/1.json", "data/oe/genesis/2.json"):
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / path, root / path)
    return root


def save(root, relative, data):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(data))


def test_genesis_is_config_only_and_portable(fixture_root, tmp_path):
    expected = artifacts(profile=GENESIS)
    assert artifacts(fixture_root, profile=GENESIS) == expected
    records = json.loads(expected["records/records.json"])
    assert len(records["passages"]) == 1
    assert records["passages"][0]["mapping"]["targets"] == [reference("genesis", 1, 1)]
    assert records["passages"][0]["language"] == "he"
    assert not any(records[k] for k in ("concepts", "evidence", "relations", "spans"))
    for name in ("first", "second"):
        build(tmp_path / name, profile=GENESIS)
        assert {
            p.relative_to(tmp_path / name).as_posix(): p.read_bytes()
            for p in (tmp_path / name).rglob("*")
            if p.is_file()
        } == expected
    subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.knowledge",
            "check",
            "--profile",
            GENESIS,
            "--output",
            str(tmp_path / "first"),
        ],
        cwd=ROOT,
        check=True,
    )


def test_multiple_files_and_passages_same_adapter(fixture_root):
    profile = load_profile(fixture_root, GENESIS)
    manifest = read_json(fixture_root / profile["input_manifest"])
    mappings = read_json(fixture_root / profile["reference_mappings"])
    for chapter, verse in ((1, 2), (2, 1)):
        spec = copy.deepcopy(profile["scripture"][0])
        spec["passages"] = [{"chapter": chapter, "verse_label": str(verse)}]
        if chapter == 2:
            spec["input_id"] = "oe-genesis-two"
            item = copy.deepcopy(manifest["inputs"][0])
            item.update(id=spec["input_id"], path="data/oe/genesis/2.json")
            item["sha256"] = digest((fixture_root / item["path"]).read_bytes())
            manifest["inputs"].append(item)
        profile["scripture"].append(spec)
        query = reference("genesis", chapter, verse)
        manifest["pilots"].append(["genesis", chapter, verse])
        mapping = copy.deepcopy(mappings["passages"][0])
        mapping.update(chapter=chapter, verse_label=str(verse), target=query)
        mappings["passages"].append(mapping)
        profile["coverage"].extend(
            [{**c, "reference": query} for c in profile["coverage"][:4]]
        )
    save(fixture_root, GENESIS, profile)
    save(fixture_root, profile["input_manifest"], manifest)
    save(fixture_root, profile["reference_mappings"], mappings)
    records = json.loads(
        artifacts(fixture_root, profile=GENESIS)["records/records.json"]
    )
    assert len(records["passages"]) == 3
    assert {p["provenance"]["source_id"] for p in records["passages"]} == {
        "source:oe-genesis",
        "source:oe-genesis-two",
    }


@pytest.mark.parametrize(
    "mutation",
    [
        "adapter",
        "unknown_input",
        "missing_passage",
        "duplicate_passage",
        "duplicate_input",
        "input_drift",
        "path",
        "executable",
        "coverage",
        "duplicate_coverage",
        "undeclared_coverage",
        "absent_with_passage",
    ],
)
def test_invalid_configuration_fails(fixture_root, mutation):
    profile = load_profile(fixture_root, GENESIS)
    manifest = read_json(fixture_root / profile["input_manifest"])
    if mutation == "adapter":
        profile["scripture"][0]["adapter"] = "import.os"
    elif mutation == "unknown_input":
        profile["scripture"][0]["input_id"] = "missing"
    elif mutation == "missing_passage":
        profile["scripture"][0]["passages"][0]["verse_label"] = "999"
    elif mutation == "duplicate_passage":
        duplicate = copy.deepcopy(profile["scripture"][0])
        duplicate["passages"].append({"chapter": 1, "verse_label": "2"})
        profile["scripture"].append(duplicate)
    elif mutation == "duplicate_input":
        manifest["inputs"].append(copy.deepcopy(manifest["inputs"][0]))
    elif mutation == "input_drift":
        (fixture_root / manifest["inputs"][0]["path"]).write_text("[]")
    elif mutation == "path":
        profile["input_manifest"] = "../outside.json"
    elif mutation == "executable":
        profile["command"] = "echo unauthorized"
    elif mutation == "coverage":
        profile["coverage"][0]["reference"] = reference("genesis", 5, 1)
    elif mutation == "duplicate_coverage":
        profile["coverage"].append({**profile["coverage"][0], "reason": "another"})
    elif mutation == "undeclared_coverage":
        profile["coverage"].pop()
    else:
        profile["coverage"][0]["status"] = "absent"
    save(fixture_root, GENESIS, profile)
    save(fixture_root, "tests/fixtures/knowledge/genesis/inputs.json", manifest)
    with pytest.raises((ValueError, ValidationError)):
        artifacts(fixture_root, profile=GENESIS)


@pytest.mark.parametrize(
    "body",
    [
        "## Missing\nx",
        "## Selected\na\n## Selected\nb",
        "## Selected suffix\nx",
        "```\n## Selected\nfake\n```",
    ],
)
def test_missing_or_ambiguous_markdown_sections_fail(body):
    with pytest.raises(ValueError, match="missing or ambiguous"):
        public_note(("---\nid: synthetic\n---\n" + body).encode(), "Selected")


def test_synthetic_shaul_selections_and_upstream_endpoints(fixture_root):
    profile = load_profile(fixture_root, GENESIS)
    manifest = read_json(fixture_root / profile["input_manifest"])
    query = reference("genesis", 1, 1)
    specs = [
        (
            "entity",
            "synthetic-concept",
            {
                "id": "synthetic-concept",
                "type": "concept",
                "names": {"en": "Test only"},
            },
        ),
        (
            "entity",
            "synthetic-word",
            {"id": "synthetic-word", "type": "word", "script": "test"},
        ),
        (
            "mention",
            "synthetic-mention",
            {"id": "synthetic-mention", "text": "Synthetic test evidence"},
        ),
        (
            "relation",
            "synthetic-relation",
            {
                "id": "synthetic-relation",
                "type": "expresses",
                "source": "word:synthetic-word",
                "target": "concept:synthetic-concept",
                "status": "proposed",
            },
        ),
    ]
    for adapter, key, value in specs:
        path = f"tests/fixtures/knowledge/synthetic/{key}.yml"
        save(fixture_root, path, value)
        manifest["inputs"].append(
            dict(
                id=key,
                owner="shaul",
                repository="https://example.invalid/synthetic-test-only",
                revision="synthetic-fixture-v1",
                path=f"knowledge/{key}.yml",
                fixture_path=path,
                sha256=digest((fixture_root / path).read_bytes()),
            )
        )
        spec = dict(adapter=adapter, input_id=key)
        if adapter == "mention":
            spec["targets"] = [{"kind": "reference", "reference": query}]
        if adapter == "relation":
            spec["evidence_ids"] = ["shaul:evidence:synthetic-mention"]
        profile["shaul"].append(spec)
    note_path = "tests/fixtures/knowledge/synthetic/note.md"
    (fixture_root / note_path).write_text(
        "---\nid: synthetic-note\nreferences: []\n---\n## Another heading\nDifferent test section.\n## Excluded\nNot selected.\n"
    )
    manifest["inputs"].append(
        dict(
            id="synthetic-note",
            owner="shaul",
            repository="https://example.invalid/synthetic-test-only",
            revision="synthetic-fixture-v1",
            path="content/synthetic.md",
            fixture_path=note_path,
            sha256=digest((fixture_root / note_path).read_bytes()),
        )
    )
    profile["shaul"].append(
        dict(
            adapter="note",
            input_id="synthetic-note",
            id="shaul:evidence:synthetic-note",
            upstream_id="content/synthetic",
            heading="Another heading",
            targets=[{"kind": "reference", "reference": query}],
        )
    )
    save(fixture_root, GENESIS, profile)
    save(fixture_root, profile["input_manifest"], manifest)
    records = json.loads(
        artifacts(fixture_root, profile=GENESIS)["records/records.json"]
    )
    bundle = project(records, query, "0" * 64)
    Validator().bundle(bundle)
    relation = bundle["records"]["relations"][0]
    assert relation["subject"]["id"] == "shaul:expression:synthetic-word"
    assert relation["object"]["id"] == "shaul:concept:synthetic-concept"
    note = next(e for e in bundle["records"]["evidence"] if e["kind"] == "note")
    assert note["content"]["section"] == "Different test section."
    assert not project(records, reference("genesis", 1, 2), "0" * 64)["records"][
        "relations"
    ]
    records["concepts"][0]["provenance"]["visibility"] = "private"
    assert not project(records, query, "0" * 64)["records"]["relations"]
    profile["shaul"][3]["evidence_ids"] = ["shaul:evidence:missing"]
    save(fixture_root, GENESIS, profile)
    with pytest.raises(ValueError, match="Unresolved"):
        artifacts(fixture_root, profile=GENESIS)


def test_default_profile_coverage_is_explicit():
    assert load_profile(ROOT) == load_profile(ROOT, DEFAULT_PROFILE)
    bundle = json.loads(artifacts()["bundles/daniel/7/13.json"])
    assert {c["edition_id"]: c["status"] for c in bundle["coverage"]} == {
        "oe": "present",
        "tth-es": "absent",
        "delitzsch": "not_requested",
        "sblgnt-tagnt": "not_requested",
    }


def test_configured_lexical_selection_preserves_codes(fixture_root):
    profile = load_profile(fixture_root, GENESIS)
    manifest = read_json(fixture_root / profile["input_manifest"])
    path = "tests/fixtures/knowledge/synthetic/lexical.json"
    save(
        fixture_root,
        path,
        {"G3004G": {"lemma": "synthetic"}, "H430": {"lemma": "test"}},
    )
    manifest["inputs"].append(
        dict(
            id="test-lexical",
            owner="davar",
            repository="https://example.invalid/synthetic-test-only",
            revision="synthetic-fixture-v1",
            path=path,
            sha256=digest((fixture_root / path).read_bytes()),
        )
    )
    profile["lexical"] = [
        dict(input_id="test-lexical", id_namespace="test-only", codes=["G3004G"])
    ]
    save(fixture_root, GENESIS, profile)
    save(fixture_root, profile["input_manifest"], manifest)
    records = json.loads(
        artifacts(fixture_root, profile=GENESIS)["records/records.json"]
    )
    assert len(records["evidence"]) == 1
    assert records["evidence"][0]["targets"] == [
        {
            "kind": "external_lexical",
            "reference": {"namespace": "tagnt", "code": "G3004G"},
        }
    ]
    assert not project(records, reference("genesis", 1, 1), "0" * 64)["records"][
        "evidence"
    ]
    profile["lexical"][0]["codes"] = ["H999999"]
    save(fixture_root, GENESIS, profile)
    with pytest.raises(ValueError, match="lexical entry missing"):
        artifacts(fixture_root, profile=GENESIS)
