import hashlib
import subprocess

import pytest

from scripts.commentary.build import build, compile_corpus, sections


def snapshot(tmp_path, files):
    root = tmp_path / "shaul"
    root.mkdir()
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    for name, content in {"LICENSE": "Synthetic fixture license\n", **files}.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    subprocess.run(["git", "-C", str(root), "add", "."], check=True)
    subprocess.run(["git", "-C", str(root), "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture"], check=True)
    revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"]).decode().strip()
    return root, revision


def test_exact_utf8_sections_fences_and_context():
    original = "# Tesis\nאמונה — original\n\n## Detail\n```md\n## Not a boundary\n```\n### Cautelas\nVerify this interpretation.\n## Créditos\nOriginal author\n".encode()
    result = sections(original, 0)
    assert [s["heading"] for s in result] == ["Tesis", "Detail", "Créditos"]
    assert all(s["context"] for s in result)
    assert b"".join(original[s["start_byte"]:s["end_byte"]] for s in result) == original
    for section in result:
        assert section["sha256"] == hashlib.sha256(original[section["start_byte"]:section["end_byte"]]).hexdigest()


def test_full_inventory_determinism_and_source_preservation(tmp_path):
    root, revision = snapshot(tmp_path, {
        "content/topic.md": "---\ntitle: Original note\nreferences: ['#juan_1_51', '#unknown_3_1']\n---\n# Tesis\nExact original text.\n## Pendiente de verificar\nCaution.\n## Créditos\nAuthor.\n[[missing]]\n",
        "content/draft.md": "---\ndraft: true\n---\nPrivate draft\n",
        "content/private/note.md": "Hidden source\n",
        "content/templates/note.md": "Template\n",
        "content/local.md": "---\ntitle: Private pointer\n---\nprivate/transcripts/secret.txt\n",
        "knowledge/concepts/son-of-man.yml": "id: son-of-man\ntype: concept\nnames: {es: Hijo del Hombre}\narticles: [{path: topic}]\n",
    })
    before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file() and ".git" not in p.parts}
    corpus, report = compile_corpus(root, revision=revision)
    assert report["discovered"] == 6
    assert report["indexed"] == 2
    assert report["excluded"] == 4
    assert len(report["dispositions"]) == report["discovered"]
    assert {d["reason"] for d in report["diagnostics"]} >= {"unknown_or_ambiguous_alias", "broken_or_ambiguous_wikilink"}
    assert "shaul:content/topic" in corpus["indexes"]["topics"]["concept:son-of-man"]
    assert corpus["indexes"]["aliases"]["son of man"] == ["shaul:concept:son-of-man"]
    for record in corpus["records"]:
        original = before[root / record["path"]]
        assert original == record["text"].encode()
        assert record["sha256"] == hashlib.sha256(original).hexdigest()
    assert before == {p: p.read_bytes() for p in before}
    build(root, tmp_path / "first", revision=revision)
    build(root, tmp_path / "second", revision=revision)
    assert (tmp_path / "first/corpus.json").read_bytes() == (tmp_path / "second/corpus.json").read_bytes()
    assert (tmp_path / "first/report.json").read_bytes() == (tmp_path / "second/report.json").read_bytes()


def test_dirty_or_wrong_revision_snapshot_is_rejected(tmp_path):
    root, revision = snapshot(tmp_path, {"content/note.md": "Original\n"})
    with pytest.raises(ValueError, match="pinned revision"):
        compile_corpus(root, revision="0" * 40)
    (root / "content/note.md").write_text("Changed\n")
    with pytest.raises(ValueError, match="pinned Git bytes"):
        compile_corpus(root, revision=revision)


def test_unsupported_reference_remains_unresolved(tmp_path):
    root, revision = snapshot(tmp_path, {"content/note.md": "---\nreferences: ['#daniel_3_31', '#weird_0_0']\n---\nOriginal\n"})
    corpus, report = compile_corpus(root, revision=revision)
    assert all(ref["status"] == "unresolved" for ref in corpus["records"][0]["references"])
    assert report["source_preservation_verified"]


def test_output_cannot_overwrite_snapshot_or_existing_artifact(tmp_path):
    root, revision = snapshot(tmp_path, {"content/note.md": "Original\n"})
    with pytest.raises(ValueError, match="separate"):
        build(root, root / "generated", revision=revision)
    build(root, tmp_path / "output", revision=revision)
    with pytest.raises(ValueError, match="new or empty"):
        build(root, tmp_path / "output", revision=revision)
