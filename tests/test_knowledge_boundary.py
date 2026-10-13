"""The boundary guard scopes itself to the knowledge allowlist."""

import subprocess
from pathlib import Path

import pytest

from scripts.knowledge.compatibility import SHAUL_REVISION, boundary, tree
from scripts.knowledge.core import encoded


def git(repo: Path, *args: str):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)


def commit_repo(repo: Path):
    repo.mkdir(parents=True)
    git(repo, "init", "-q")
    git(repo, "config", "user.email", "boundary-test@example.com")
    git(repo, "config", "user.name", "Boundary Test")
    git(repo, "config", "commit.gpgsign", "false")


def knowledge_repo(tmp_path: Path):
    repo = tmp_path / "davar"
    commit_repo(repo)
    files = {
        ".github/instructions/bun.instructions.md": "bun\n",
        ".github/workflows/knowledge-foundation.yml": "name: Knowledge foundation\n",
        "data/knowledge/kept.json": "{}\n",
        "scripts/knowledge/compatibility.py": "# knowledge\n",
    }
    for name, text in files.items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "base")
    base = subprocess.check_output(
        ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
    ).strip()
    return repo, base


def unpinned_shaul(path: Path):
    commit_repo(path)
    (path / "README").write_text("unpinned\n")
    git(path, "add", ".")
    git(path, "commit", "-q", "-m", "unpinned")
    return path


def test_legacy_version_clock_values_are_ignored(tmp_path):
    (tmp_path / "version.json").write_bytes(
        encoded({"version": "2026.09.23-1", "generated_at": "old"})
    )
    initial = tree(tmp_path, legacy_clock=True)
    exact = tree(tmp_path)
    (tmp_path / "version.json").write_bytes(
        encoded({"version": "2026.09.24-1", "generated_at": "new"})
    )
    assert initial == tree(tmp_path, legacy_clock=True)
    assert exact != tree(tmp_path)
    (tmp_path / "version.json").write_bytes(
        encoded(
            {
                "version": "2026.09.24-1",
                "generated_at": "new",
                "extra": "kept",
            }
        )
    )
    assert initial != tree(tmp_path, legacy_clock=True)


def test_boundary_ignores_paths_outside_the_allowlist(tmp_path):
    repo, base = knowledge_repo(tmp_path)
    (repo / ".github/instructions/bun.instructions.md").unlink()
    outside = repo / "docs/out-of-scope.md"
    outside.parent.mkdir()
    outside.write_text("added outside\n")
    git(repo, "add", "docs/out-of-scope.md")
    (repo / "scratch.txt").write_text("untracked outside\n")
    added = repo / "tests/test_knowledge_added.py"
    added.parent.mkdir()
    added.write_text("def test_added():\n    pass\n")
    git(repo, "add", "tests/test_knowledge_added.py")
    (repo / "contracts/biblical-knowledge/v1/note.md").parent.mkdir(parents=True)
    (repo / "contracts/biblical-knowledge/v1/note.md").write_text("untracked inside\n")
    boundary(base, repo, shaul_root=unpinned_shaul(tmp_path / "shaul"))


def test_boundary_rejects_other_non_adds_inside_the_allowlist(tmp_path):
    repo, base = knowledge_repo(tmp_path)
    (repo / "data/knowledge/kept.json").write_text('{"changed": true}\n')
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)
    (repo / "data/knowledge/kept.json").write_text("{}\n")
    workflow = repo / ".github/workflows/knowledge-foundation.yml"
    workflow.write_text("name: changed\n")
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)


def test_knowledge_script_edits_still_require_the_pinned_shaul_revision(tmp_path):
    assert SHAUL_REVISION == "8c94b0fe9eca817e22340430309801d0ef76125b"
    repo, base = knowledge_repo(tmp_path)
    script = repo / "scripts/knowledge/compatibility.py"
    script.write_text(script.read_text() + "# edit\n")
    with pytest.raises(
        ValueError, match="Shaul regression checkout must be at the pinned revision"
    ):
        boundary(base, repo, shaul_root=unpinned_shaul(tmp_path / "shaul"))
    script.write_text("# knowledge\n")
    added = repo / "scripts/knowledge/new_module.py"
    added.write_text("x = 1\n")
    git(repo, "add", "scripts/knowledge/new_module.py")
    boundary(base, repo, shaul_root=unpinned_shaul(tmp_path / "shaul-add"))


FOLDED = """\
name: CI
jobs:
  knowledge:
    steps:
      - run: python -m pytest -q tests/test_knowledge_*.py tests/test_commentary_corpus.py
      - run: python -m scripts.knowledge check
      - run: python -m scripts.knowledge.compatibility boundary --base "$BASE_SHA"
      - run: bun test tests/fixtures/knowledge/legacy-mapping.test.ts
      - run: python -m scripts.knowledge.compatibility legacy --base "$BASE_SHA"
      - run: python scripts/test_build_verse_index.py
      - run: bun test scripts/knowledge.test.ts
      - run: python -m scripts.knowledge.compatibility shaul --shaul-root ../shaul
"""


def test_deleting_the_knowledge_workflow_requires_the_commands_in_ci(tmp_path, capsys):
    repo, base = knowledge_repo(tmp_path)
    (repo / ".github/workflows/knowledge-foundation.yml").unlink()
    with pytest.raises(ValueError, match="Knowledge checks left .github/workflows/ci.yml"):
        boundary(base, repo)
    (repo / ".github/workflows/ci.yml").write_text(FOLDED)
    boundary(base, repo)
    assert (
        capsys.readouterr().out
        == "Additive file boundary and legacy import isolation: OK\n"
    )


def test_a_later_ci_edit_cannot_drop_a_folded_knowledge_command(tmp_path, capsys):
    repo, base = knowledge_repo(tmp_path)
    (repo / ".github/workflows/knowledge-foundation.yml").unlink()
    ci = repo / ".github/workflows/ci.yml"
    ci.write_text(FOLDED)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "fold knowledge checks")
    base = subprocess.check_output(
        ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
    ).strip()
    ci.write_text(FOLDED.replace("      - run: python -m scripts.knowledge check\n", ""))
    with pytest.raises(ValueError, match="Knowledge checks left .github/workflows/ci.yml"):
        boundary(base, repo)
    ci.write_text(FOLDED + "\n")
    boundary(base, repo)
    assert (
        capsys.readouterr().out
        == "Additive file boundary and legacy import isolation: OK\n"
    )


def test_editing_the_old_workflow_still_fails_when_ci_has_the_commands(tmp_path):
    repo, base = knowledge_repo(tmp_path)
    (repo / ".github/workflows/ci.yml").write_text(FOLDED)
    (repo / ".github/workflows/knowledge-foundation.yml").write_text("name: changed\n")
    with pytest.raises(ValueError, match="Non-additive or out-of-scope change"):
        boundary(base, repo)


def test_knowledge_test_edits_require_the_pinned_shaul_revision(tmp_path):
    """Companion tests may change with knowledge code, but still need the Shaul pin."""
    repo, base = knowledge_repo(tmp_path)
    added = repo / "tests/test_knowledge_added.py"
    added.parent.mkdir()
    added.write_text("def test_added():\n    pass\n")
    git(repo, "add", "tests/test_knowledge_added.py")
    git(repo, "commit", "-q", "-m", "add knowledge test")
    base = subprocess.check_output(
        ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
    ).strip()
    added.write_text("def test_added():\n    assert True\n")
    with pytest.raises(
        ValueError, match="Shaul regression checkout must be at the pinned revision"
    ):
        boundary(base, repo, shaul_root=unpinned_shaul(tmp_path / "shaul"))
