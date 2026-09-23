"""The boundary guard scopes itself to the knowledge allowlist."""

import subprocess
from pathlib import Path

import pytest

from scripts.knowledge.compatibility import SHAUL_REVISION, boundary


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
