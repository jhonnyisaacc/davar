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
    refreshed = refreshed_outputs(("data/greek/preview/greek/releases/sblgnt/new/lexicon.json",))
    expected = {"greek/manifest.json": "old", "bundles/greek-sblgnt.json": "old", "bundles/tanaj.json": "old"}
    actual = {"greek/manifest.json": "new", "bundles/greek-sblgnt.json": "new", "bundles/tanaj.json": "new"}
    assert legacy_generation_differences(expected, actual, refreshed) == ["bundles/tanaj.json"]


def test_a_repin_outside_the_refresh_table_keeps_legacy_parity_strict():
    refreshed = refreshed_outputs(("data/oe/daniel/7.json",))
    assert refreshed == ()
    assert legacy_generation_differences({"greek/manifest.json": "old"}, {"greek/manifest.json": "new"}, refreshed) == [
        "greek/manifest.json"
    ]
