import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

KEPT = "data/knowledge/registries/books.json"
IGNORED = (
    "data/dict/lexicon/words.json",
    "data/knowledge/registries/aliases.json",
)


def _check(directory: Path, path: str) -> bool:
    result = subprocess.run(
        ["git", "check-ignore", "-q", "--", path],
        cwd=directory,
        capture_output=True,
    )
    return result.returncode == 0


def test_mobile_bundle_book_registry_is_uploaded(tmp_path: Path) -> None:
    rules = (ROOT / ".easignore").read_text()
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    (tmp_path / ".gitignore").write_text(rules)
    for path in (KEPT, *IGNORED):
        file = tmp_path / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("{}\n")

    assert not _check(tmp_path, KEPT), "book registry must ship in the EAS archive"
    for path in IGNORED:
        assert _check(tmp_path, path), path
