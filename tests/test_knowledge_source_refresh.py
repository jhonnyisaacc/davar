import json
import subprocess
from pathlib import Path

import pytest

from scripts.knowledge.compatibility import boundary, legacy_generation_differences, refreshed_outputs

INPUTS = {
    "contract_version": "1.0.0",
    "inputs": [
        {
            "id": "greek",
            "owner": "davar",
            "revision": "base",
            "path": "data/greek/old/john/1.json",
            "sha256": "old",
        }
    ],
}
EDITIONS = [{"id": "sblgnt-tagnt", "name": "SBLGNT", "source_revision": "old"}]


def git(repo: Path, *args: str):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def write(repo: Path, name: str, payload):
    path = repo / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def pilot_repo(tmp_path: Path):
    repo = tmp_path / "davar"
    repo.mkdir()
    git(repo, "init", "-q")
    git(repo, "config", "user.email", "refresh-test@example.com")
    git(repo, "config", "user.name", "Refresh Test")
    git(repo, "config", "commit.gpgsign", "false")
    write(repo, "data/knowledge/pilot-inputs.json", INPUTS)
    write(repo, "data/knowledge/registries/editions.json", EDITIONS)
    write(repo, "data/knowledge/generated/pilot-v1/bundles/john/1/1.json", {"translit": "archēa"})
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "base")
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    return repo, base


def repin(repo: Path, **changes):
    inputs = json.loads(json.dumps(INPUTS))
    inputs["inputs"][0].update(changes)
    write(repo, "data/knowledge/pilot-inputs.json", inputs)


def test_repinned_sources_may_refresh_editions_and_generated_pilot(tmp_path, capsys):
    repo, base = pilot_repo(tmp_path)
    repin(repo, path="data/greek/new/john/1.json", sha256="new")
    write(repo, "data/knowledge/registries/editions.json", [{**EDITIONS[0], "source_revision": "new"}])
    write(repo, "data/knowledge/generated/pilot-v1/bundles/john/1/1.json", {"translit": "archē"})
    boundary(base, repo)
    assert capsys.readouterr().out == "Additive file boundary and legacy import isolation: OK\n"


def test_generated_pilot_stays_frozen_without_a_repin(tmp_path):
    repo, base = pilot_repo(tmp_path)
    write(repo, "data/knowledge/generated/pilot-v1/bundles/john/1/1.json", {"translit": "archē"})
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)


@pytest.mark.parametrize("field", ["id", "owner", "revision"])
def test_a_repin_cannot_change_input_identity(tmp_path, field):
    repo, base = pilot_repo(tmp_path)
    repin(repo, sha256="new", **{field: "other"})
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)


def test_a_repin_cannot_change_edition_fields_other_than_source_revision(tmp_path):
    repo, base = pilot_repo(tmp_path)
    repin(repo, sha256="new")
    write(repo, "data/knowledge/registries/editions.json", [{**EDITIONS[0], "name": "Other"}])
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)


def test_a_greek_repin_exempts_only_greek_outputs_from_legacy_parity():
    refreshed = refreshed_outputs((("data/greek/preview/old/lexicon.json", "data/greek/preview/new/lexicon.json"),))
    expected = {"greek/manifest.json": "old", "bundles/greek-sblgnt.json": "old", "bundles/tanaj.json": "old"}
    actual = {"greek/manifest.json": "new", "bundles/greek-sblgnt.json": "new", "bundles/tanaj.json": "new"}
    assert legacy_generation_differences(expected, actual, refreshed) == ["bundles/tanaj.json"]


def test_a_lexicon_repin_exempts_only_dictionary_outputs_from_legacy_parity():
    refreshed = refreshed_outputs((("data/dict/lexicon/words.json", "data/dict/lexicon/words.json"),))
    expected = {"dict/entries/H31.json": "old", "dict/words.json": "old", "bundles/dictionary.json": "old", "bundles/tanaj.json": "old"}
    actual = {"dict/entries/H31.json": "new", "dict/words.json": "new", "bundles/dictionary.json": "new", "bundles/tanaj.json": "new"}
    assert legacy_generation_differences(expected, actual, refreshed) == ["bundles/tanaj.json"]


def test_a_repin_outside_the_refresh_table_keeps_legacy_parity_strict():
    refreshed = refreshed_outputs((("data/oe/old.json", "data/oe/daniel/7.json"),))
    assert refreshed == ()
    assert legacy_generation_differences({"greek/manifest.json": "old"}, {"greek/manifest.json": "new"}, refreshed) == [
        "greek/manifest.json"
    ]


def test_a_greek_refresh_ignores_only_the_greek_version_key(tmp_path):
    from scripts.knowledge.core import encoded
    from scripts.knowledge.compatibility import tree

    refreshed = refreshed_outputs((("data/greek/preview/old", "data/greek/preview/new"),))
    versions = tmp_path / "bundles/versions.json"
    versions.parent.mkdir()
    versions.write_bytes(encoded({"tanaj": 3, "greek:sblgnt:old": 1}))
    before = tree(tmp_path, legacy_clock=True, refreshed=refreshed)
    versions.write_bytes(encoded({"tanaj": 3, "greek:sblgnt:new": 1}))
    assert tree(tmp_path, legacy_clock=True, refreshed=refreshed) == before
    versions.write_bytes(encoded({"tanaj": 4, "greek:sblgnt:new": 1}))
    assert tree(tmp_path, legacy_clock=True, refreshed=refreshed) != before


def test_a_lexicon_refresh_ignores_only_the_dictionary_manifest_entry(tmp_path):
    from scripts.knowledge.core import encoded
    from scripts.knowledge.compatibility import tree

    refreshed = refreshed_outputs((("data/dict/lexicon/words.json", "data/dict/lexicon/words.json"),))
    manifest = tmp_path / "manifest.json"

    def bundles(dictionary, tanaj):
        return {"bundles": {"dictionary": {"checksum": dictionary}, "tanaj": {"checksum": tanaj}}}

    manifest.write_bytes(encoded(bundles("old", "same")))
    before = tree(tmp_path, legacy_clock=True, refreshed=refreshed)
    strict = tree(tmp_path, legacy_clock=True)
    manifest.write_bytes(encoded(bundles("new", "same")))
    assert tree(tmp_path, legacy_clock=True, refreshed=refreshed) == before
    assert tree(tmp_path, legacy_clock=True) != strict
    manifest.write_bytes(encoded(bundles("new", "changed")))
    assert tree(tmp_path, legacy_clock=True, refreshed=refreshed) != before


def test_a_repin_cannot_carry_a_builder_change_into_the_generated_pilot(tmp_path):
    repo, base = pilot_repo(tmp_path)
    builder = repo / "scripts/knowledge/build.py"
    builder.parent.mkdir(parents=True)
    builder.write_text("x = 1\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "builder")
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    builder.write_text("x = 2\n")
    repin(repo, path="data/greek/new/john/1.json", sha256="new")
    write(repo, "data/knowledge/generated/pilot-v1/bundles/john/1/1.json", {"translit": "archē"})
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)


@pytest.mark.parametrize(
    "edition",
    [
        {"id": "sblgnt-tagnt", "name": "SBLGNT", "source_revision": "unrelated"},
        {"id": "sblgnt-tagnt", "name": "SBLGNT"},
    ],
)
def test_an_edition_revision_must_follow_a_repinned_input(tmp_path, edition):
    repo, base = pilot_repo(tmp_path)
    repin(repo, path="data/greek/new/john/1.json", sha256="new")
    write(repo, "data/knowledge/registries/editions.json", [edition])
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)


LEXICON_REFRESH = refreshed_outputs((("data/dict/lexicon/custom_definitions.json", "data/dict/lexicon/custom_definitions.json"),))


def legacy_bundle_files(root: Path, versions: dict, manifest_bundles: dict):
    from scripts.knowledge.core import encoded

    (root / "bundles").mkdir(parents=True, exist_ok=True)
    (root / "bundles/versions.json").write_bytes(encoded(versions))
    bundles = {**manifest_bundles, "versions": {"size": 50, "checksum": json.dumps(versions, sort_keys=True)}}
    (root / "manifest.json").write_bytes(encoded({"version": "clock", "bundles": bundles}))


def legacy_differences(tmp_path: Path, refreshed, after_versions: dict, after_bundles: dict):
    from scripts.knowledge.compatibility import tree

    before_bundles = {"dictionary": {"checksum": "old"}, "tanaj": {"checksum": "same"}}
    base, candidate = tmp_path / "base", tmp_path / "candidate"
    legacy_bundle_files(base, {"tanaj": 1, "dictionary": 3}, before_bundles)
    legacy_bundle_files(candidate, after_versions, after_bundles)
    return legacy_generation_differences(
        tree(base, legacy_clock=True, refreshed=refreshed),
        tree(candidate, legacy_clock=True, refreshed=refreshed),
        refreshed,
    )


def test_a_lexicon_repin_allows_the_dictionary_bundle_version_bump(tmp_path):
    after_bundles = {"dictionary": {"checksum": "new"}, "tanaj": {"checksum": "same"}}
    assert legacy_differences(tmp_path, LEXICON_REFRESH, {"tanaj": 1, "dictionary": 4}, after_bundles) == []


@pytest.mark.parametrize(
    "after_versions",
    [{"tanaj": 2, "dictionary": 4}, {"tanaj": 1, "dictionary": 4, "dss": 1}, {"dictionary": 4}],
)
def test_a_lexicon_repin_keeps_every_other_bundle_version_strict(tmp_path, after_versions):
    after_bundles = {"dictionary": {"checksum": "new"}, "tanaj": {"checksum": "same"}}
    assert legacy_differences(tmp_path, LEXICON_REFRESH, after_versions, after_bundles) == ["bundles/versions.json"]


@pytest.mark.parametrize(
    ("refreshed", "expected"),
    [
        ((), ["bundles/versions.json", "manifest.json"]),
        (refreshed_outputs((("data/greek/preview/old", "data/greek/preview/new"),)), ["bundles/versions.json"]),
    ],
)
def test_a_dictionary_version_bump_without_a_lexicon_repin_fails(tmp_path, refreshed, expected):
    after_bundles = {"dictionary": {"checksum": "old"}, "tanaj": {"checksum": "same"}}
    assert legacy_differences(tmp_path, refreshed, {"tanaj": 1, "dictionary": 4}, after_bundles) == expected


@pytest.mark.parametrize(
    "after_bundles",
    [
        {"dictionary": {"checksum": "new"}, "tanaj": {"checksum": "changed"}},
        {"dictionary": {"checksum": "new"}, "tanaj": {"checksum": "same"}, "dss": {"checksum": "added"}},
        {"dictionary": {"checksum": "new"}},
    ],
)
def test_a_lexicon_repin_keeps_every_other_manifest_entry_strict(tmp_path, after_bundles):
    assert legacy_differences(tmp_path, LEXICON_REFRESH, {"tanaj": 1, "dictionary": 4}, after_bundles) == ["manifest.json"]
