"""Guard the guardrails, including the exact legacy timestamp exception."""

import copy
import json
import shutil

import pytest

from scripts.knowledge.build import artifacts, build, output_guard
from scripts.knowledge.compatibility import tree
from scripts.knowledge.core import (
    KNOWLEDGE,
    ROOT,
    encoded,
    pinned_inputs,
    read_json,
)
from scripts.knowledge.validate import Validator


def test_only_legacy_manifest_clock_values_are_ignored(tmp_path):
    (tmp_path / "manifest.json").write_bytes(
        encoded(
            {
                "version": "old",
                "generated_at": "old",
                "bundles": {"dictionary": {"checksum": "a"}},
            }
        )
    )
    initial = tree(tmp_path, legacy_clock=True)
    exact = tree(tmp_path)
    (tmp_path / "manifest.json").write_bytes(
        encoded(
            {
                "version": "new",
                "generated_at": "new",
                "bundles": {"dictionary": {"checksum": "a"}},
            }
        )
    )
    assert initial == tree(tmp_path, legacy_clock=True)
    assert exact != tree(tmp_path)
    (tmp_path / "manifest.json").write_bytes(
        encoded(
            {
                "version": "new",
                "generated_at": "new",
                "bundles": {"dictionary": {"checksum": "b"}},
            }
        )
    )
    assert initial != tree(tmp_path, legacy_clock=True)


def test_optional_shaul_root_is_pinned_and_read_only(tmp_path):
    shaul = tmp_path / "shaul"
    manifest, _ = pinned_inputs(ROOT)
    for item in manifest["inputs"]:
        if item["owner"] != "shaul":
            continue
        path = shaul / item["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / item["fixture_path"], path)
    (shaul / "static/api/v1/verse-notes").mkdir(parents=True)
    (shaul / "static/api/v1/verse-notes/index.json").write_text('{"untouched":true}')
    before = tree(shaul)
    assert artifacts(shaul_root=shaul) == artifacts()
    assert tree(shaul) == before
    with pytest.raises(ValueError, match="overlaps Shaul"):
        build(shaul / "new-output", shaul_root=shaul)
    (shaul / "knowledge/concepts/son-of-man.yml").write_text("id: changed\n")
    with pytest.raises(ValueError, match="Pinned input drift"):
        artifacts(shaul_root=shaul)


def test_other_checkouts_are_not_output_roots(tmp_path):
    other = tmp_path / "other"
    other.mkdir()
    (other / ".git").write_text("gitdir: unrelated")
    with pytest.raises(ValueError, match="another checkout"):
        output_guard(other / "web/public/data", ROOT)


def test_registry_ambiguity_is_rejected():
    registries = {
        p.stem: read_json(p) for p in (ROOT / KNOWLEDGE / "registries").glob("*.json")
    }
    validator = Validator()
    validator.registries(registries)
    assert len(registries["books"]) == 66
    registries["aliases"].append(copy.deepcopy(registries["aliases"][0]))
    with pytest.raises(ValueError, match="duplicate alias"):
        validator.registries(registries)


def test_bundle_coverage_and_relations_are_validated():
    outputs = artifacts()
    bundle = json.loads(outputs["bundles/john/1/51.json"])
    next(c for c in bundle["coverage"] if c["status"] == "present")["status"] = "absent"
    with pytest.raises(ValueError, match="Coverage"):
        Validator().bundle(bundle)
    records = json.loads(outputs["records/records.json"])
    records["relations"][0]["predicate"] = "contextually_related_to"
    records["relations"][0].pop("scope", None)
    with pytest.raises(ValueError, match="requires scope"):
        Validator().records(records)


def test_no_private_transcripts_or_machine_paths_in_artifacts():
    for payload in artifacts().values():
        for prohibited in (
            b"private/transcripts",
            b"/Users/",
            b"/private/tmp/",
            b"OpenRouter",
        ):
            assert prohibited not in payload
