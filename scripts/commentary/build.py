"""Build an isolated exact-text search corpus; never rewrite Shaul source files."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata

import yaml

from scripts.knowledge.adapters import SourceLoader
from scripts.knowledge.core import normalize_tag

ROOT = Path(__file__).resolve().parents[2]
REVISION = "8c94b0fe9eca817e22340430309801d0ef76125b"
REPOSITORY = "https://github.com/jhonnyisaacc/shaul"
DEFAULT_OUTPUT = ROOT / "data/commentary/generated"
IGNORED = {"private", "templates", ".obsidian"}
PRIVATE_PATH = re.compile(r"(?:private/(?:transcripts|sources)/|knowledge/private/|/Users/)", re.I)
CONTEXT_HEADINGS = {
    "tesis", "alcance", "alcance de la nota", "pendiente de verificar",
    "creditos", "cautelas", "cautela", "advertencias", "limites",
}
STARTER_ALIASES = {
    "concept:son-of-man": ["Son of Man", "Hijo del Hombre", "בן האדם"],
    "concept:son-of-god": ["Son of God", "Hijo de Dios", "Hijo de Elohim", "בן האלהים"],
    "concept:abba": ["Father", "Padre", "Abba", "אבא"],
    "concept:emunah": ["faith", "fe", "fidelidad", "אמונה"],
}


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[^\W_]+", "".join(
        c for c in unicodedata.normalize("NFKD", text.lower())
        if not unicodedata.combining(c)
    )))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(data: object) -> bytes:
    return (json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), *args])


def sections(data: bytes, body_start: int) -> list[dict]:
    """Keep complete ATX sections and exact UTF-8 byte ranges, including preamble."""
    boundaries = [(0, "Metadata")] if body_start else []
    boundaries.append((body_start, "Introduction"))
    offset, fence = body_start, None
    for line in data[body_start:].splitlines(keepends=True):
        marker = re.match(rb"^\s{0,3}(`{3,}|~{3,})", line)
        if marker:
            current = marker[1]
            if fence is None:
                fence = current
            elif current[:1] == fence[:1] and len(current) >= len(fence):
                fence = None
        elif fence is None:
            heading = re.match(rb"^#{1,2} +(.+?)\s*#*\s*$", line.rstrip(b"\r\n"))
            if heading:
                if offset == boundaries[-1][0]:
                    boundaries[-1] = (offset, heading[1].decode())
                else:
                    boundaries.append((offset, heading[1].decode()))
        offset += len(line)
    result = []
    for index, (start, heading) in enumerate(boundaries):
        end = boundaries[index + 1][0] if index + 1 < len(boundaries) else len(data)
        if end <= start:
            continue
        text = data[start:end].decode()
        result.append({
            "heading": heading, "start_byte": start, "end_byte": end,
            "start_line": data[:start].count(b"\n") + 1,
            "end_line": data[:end].count(b"\n") + (0 if data[:end].endswith(b"\n") else 1),
            "sha256": digest(data[start:end]),
            "context": normalized(heading) in CONTEXT_HEADINGS or heading == "Introduction" or any(
                re.search(r"alcance|verificar|cautel|advertenc|limitacion|limites|creditos|procedencia", normalized(h))
                for h in re.findall(r"^#+ (.+)$", text, re.M)),
            "metadata": heading == "Metadata",
            "terms": dict(Counter(normalized(text).split())),
        })
    assert b"".join(data[s["start_byte"]:s["end_byte"]] for s in result) == data
    return result


def frontmatter(data: bytes) -> tuple[dict, int]:
    match = re.match(rb"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)", data, re.S)
    if not match:
        return {}, 0
    metadata = yaml.load(match[1], Loader=SourceLoader)
    if not isinstance(metadata, dict):
        raise ValueError("Frontmatter must be a mapping")
    return metadata, match.end()


def strings(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def compile_corpus(source: Path, *, revision=REVISION, root=ROOT) -> tuple[dict, dict]:
    source = source.resolve()
    if git(source, "rev-parse", "HEAD").decode().strip() != revision:
        raise ValueError("Shaul checkout must be at the pinned revision")
    tracked = [p.decode() for p in git(source, "ls-tree", "-rz", "--name-only", revision,
                                      "content", "knowledge").split(b"\0") if p]
    candidates = [p for p in tracked if p.endswith((".md", ".yml", ".yaml"))]
    before, records, dispositions, diagnostics = {}, [], [], []
    aliases = json.loads((root / "data/knowledge/registries/aliases.json").read_text())
    mappings = json.loads((root / "data/knowledge/registries/reference-mappings.json").read_text())
    book_aliases = defaultdict(set)
    for row in aliases:
        if row["namespace"] == "shaul":
            book_aliases[normalized(row["alias"])].add(row["book_id"])
    for row in json.loads((root / "data/knowledge/registries/books.json").read_text()):
        book_aliases[normalized(row["id"])].add(row["id"])

    for relative in candidates:
        path = source / relative
        data = git(source, "show", f"{revision}:{relative}")
        if path.is_symlink() or path.read_bytes() != data:
            raise ValueError(f"Source differs from pinned Git bytes: {relative}")
        before[relative] = digest(data)
        disposition = {"path": relative, "sha256": before[relative]}
        if any(part in IGNORED or part.startswith(".") for part in Path(relative).parts):
            dispositions.append({**disposition, "status": "excluded", "reason": "private_or_template"})
            continue
        try:
            text = data.decode("utf-8")
            if PRIVATE_PATH.search(text):
                raise ValueError("Contains a private or local source path")
            note = relative.startswith("content/")
            metadata, body_start = frontmatter(data) if note else (yaml.load(data, Loader=SourceLoader), 0)
            if not isinstance(metadata, dict):
                raise ValueError("Knowledge record must be a mapping")
            if metadata.get("draft") in (True, "true") or metadata.get("publish") in (False, "false"):
                dispositions.append({**disposition, "status": "excluded", "reason": "draft_or_unpublished"})
                continue
            if note and "guia" in strings(metadata.get("tags")) and "agente" in strings(metadata.get("tags")):
                dispositions.append({**disposition, "status": "excluded", "reason": "authoring_guidance_not_study_evidence"})
                continue
            record_type = "note" if note else metadata.get("type", Path(relative).parts[1].rstrip("s"))
            upstream_id = relative.removesuffix(".md") if note else f"{record_type}:{metadata.get('id', Path(relative).stem)}"
            names = list(metadata.get("names", {}).values()) if isinstance(metadata.get("names"), dict) else []
            title = str(metadata.get("title") or (names[0] if names else metadata.get("id", Path(relative).stem)))
            raw_refs = strings(metadata.get("references"))
            ref_records = []
            for raw in raw_refs:
                try:
                    resolved = normalize_tag(raw, aliases, mappings)
                except (ValueError, KeyError):
                    resolved = {"raw": raw, "status": "unresolved", "reason": "unsupported_reference"}
                ref_records.append(resolved)
                if resolved["status"] == "unresolved":
                    diagnostics.append({"path": relative, **resolved})
            source_id = "shaul:" + upstream_id
            routing = names + strings(metadata.get("aliases")) + strings(metadata.get("script")) + strings(metadata.get("transliteration"))
            routing += STARTER_ALIASES.get(upstream_id, [])
            linked = strings(metadata.get("note"))
            linked += [a["path"] for a in metadata.get("articles", []) if isinstance(a, dict) and isinstance(a.get("path"), str)]
            credit = "Shaul — original public study note" if note else "Shaul — original public knowledge record"
            record_sections = sections(data, body_start)
            for section in record_sections:
                section["section_id"] = f"{source_id}:section:{section['start_byte']}"
            records.append({
                "source_id": source_id, "upstream_id": upstream_id, "kind": "note" if note else "knowledge",
                "record_type": record_type, "path": relative, "title": title, "locale": "es",
                "revision": revision, "sha256": before[relative], "text": text,
                "source_url": f"{REPOSITORY}/blob/{revision}/{relative}", "attribution": credit,
                "permissions": {"public_display": True, "ai_grounding": True},
                "publication": "published", "review": "unreviewed", "metadata": metadata,
                "aliases": sorted(set(normalized(v) for v in routing if isinstance(v, str))),
                "linked_paths": linked, "references": ref_records, "sections": record_sections,
                "metadata_terms": dict(Counter(normalized(" ".join([title, upstream_id, *strings(metadata.get("tags")), *routing])).split())),
            })
            dispositions.append({**disposition, "status": "indexed", "source_id": source_id})
            if note and any("youtube:" in s for s in strings(metadata.get("source_ids"))):
                headings = {normalized(s["heading"]) for s in record_sections}
                if "mapa de la ensenanza de eric" not in headings:
                    diagnostics.append({"path": relative, "reason": "existing_traceability_section_missing"})
        except (ValueError, UnicodeError, yaml.YAMLError, TypeError) as error:
            dispositions.append({**disposition, "status": "excluded", "reason": str(error)})

    records.sort(key=lambda r: r["source_id"])
    if len({r["source_id"] for r in records}) != len(records):
        raise ValueError("Duplicate public source IDs")
    # Book names are supplied by Shaul itself, not invented translations.
    for record in records:
        if record["record_type"] == "book":
            for alias in [record["metadata"]["id"], *record["aliases"]]:
                book_aliases[normalized(alias)].add(record["metadata"]["id"])
    indexes = {name: defaultdict(set) for name in ("aliases", "topics", "books", "references")}
    note_paths = defaultdict(set)
    for record in records:
        if record["kind"] == "note":
            path = record["path"].removeprefix("content/").removesuffix(".md")
            note_paths[path].add(record["source_id"])
            note_paths[Path(path).name].add(record["source_id"])
    by_upstream = {r["upstream_id"]: r for r in records}
    for record in records:
        sid = record["source_id"]
        for alias in record["aliases"]:
            indexes["aliases"][alias].add(sid)
        for ref in strings(record["metadata"].get("references")):
            indexes["references"][ref.lower().lstrip("#")].add(sid)
            match = re.fullmatch(r"#?([\w]+)_(\d+)(?:_(\d+)(?:-(\d+))?)?", ref)
            if match:
                books = book_aliases[normalized(match[1])]
                for book in books:
                    indexes["books"][book].add(sid)
                if match[3] and match[4] and int(match[4]) >= int(match[3]) and int(match[4]) - int(match[3]) <= 500:
                    for verse in range(int(match[3]), int(match[4]) + 1):
                        indexes["references"][f"{match[1].lower()}_{match[2]}_{verse}"].add(sid)
            else:
                diagnostics.append({"path": record["path"], "reason": "unindexed_native_reference", "raw": ref})
        if record["record_type"] in ("concept", "word"):
            indexes["topics"][record["upstream_id"]].add(sid)
        for linked in record["linked_paths"]:
            key = linked.removeprefix("content/").removesuffix(".md")
            matches = note_paths.get(key, set())
            if len(matches) == 1:
                indexes["topics"][record["upstream_id"]].update(matches)
            else:
                diagnostics.append({"path": record["path"], "reason": "missing_or_ambiguous_note_link", "target": linked})
        if record["record_type"] == "mention":
            for entity in strings(record["metadata"].get("entities")):
                if entity in by_upstream:
                    indexes["topics"][entity].add(sid)
                    indexes["topics"][entity].update(indexes["topics"].get(record["upstream_id"], set()))
        if record["record_type"] == "word":
            for concept in records:
                if concept["record_type"] == "concept" and any(f.get("word") == record["upstream_id"] for f in concept["metadata"].get("forms", []) if isinstance(f, dict)):
                    indexes["topics"][record["upstream_id"]].add(concept["source_id"])
        if record["kind"] == "note":
            for target in re.findall(r"\[\[([^\]|#]+)(?:[^\]]*)\]\]", record["text"]):
                key = target.strip().removeprefix("content/").removesuffix(".md")
                if len(note_paths.get(key, set())) != 1:
                    diagnostics.append({"path": record["path"], "reason": "broken_or_ambiguous_wikilink", "target": target})
    # Resolve mention and explicit form links after all source-owned links exist.
    for record in records:
        if record["record_type"] == "mention":
            for entity in strings(record["metadata"].get("entities")):
                indexes["topics"][entity].update(indexes["topics"].get(record["upstream_id"], set()))
        elif record["record_type"] == "concept":
            for form in record["metadata"].get("forms", []):
                if isinstance(form, dict) and form.get("word") in by_upstream:
                    indexes["topics"][form["word"]].update(indexes["topics"][record["upstream_id"]])
                    indexes["topics"][record["upstream_id"]].add(by_upstream[form["word"]]["source_id"])
    for relative, checksum in before.items():
        if digest((source / relative).read_bytes()) != checksum:
            raise ValueError(f"Source changed during build: {relative}")
    source_digest = digest(encoded(before))
    license_text = git(source, "show", f"{revision}:LICENSE").decode()
    corpus = {
        "schema_version": 1, "source_revision": revision, "repository": REPOSITORY,
        "source_digest": source_digest, "records": records,
        "license": {"path": "LICENSE", "text": license_text, "sha256": digest(license_text.encode())},
        "indexes": {name: {key: sorted(ids) for key, ids in sorted(values.items())} for name, values in indexes.items()},
        "book_aliases": {key: next(iter(ids)) for key, ids in sorted(book_aliases.items()) if len(ids) == 1},
        "permission_scope": "User-authorized public Shaul notes and knowledge; private/draft sources excluded",
    }
    report = {"schema_version": 1, "source_revision": revision, "source_digest": source_digest,
              "source_preservation_verified": True, "discovered": len(candidates),
              "indexed": len(records), "excluded": len(dispositions) - len(records),
              "dispositions": dispositions, "diagnostics": diagnostics}
    return corpus, report


def build(source: Path, output: Path, *, revision=REVISION, root=ROOT) -> dict:
    output = output.absolute()
    if output != output.resolve() or output.is_symlink() or source.resolve().is_relative_to(output) or output.is_relative_to(source.resolve()):
        raise ValueError("Output must be separate from the source and contain no symlinks")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output must be new or empty; use a new directory for rebuilds")
    corpus, report = compile_corpus(source, revision=revision, root=root)
    payload = encoded(corpus)
    report["corpus_sha256"] = digest(payload)
    for disposition in report["dispositions"]:
        if digest((source / disposition["path"]).read_bytes()) != disposition["sha256"]:
            raise ValueError(f"Source changed during serialization: {disposition['path']}")
    output.mkdir(parents=True, exist_ok=True)
    (output / "corpus.json").write_bytes(payload)
    (output / "report.json").write_bytes(encoded(report))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shaul-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build(args.shaul_root, args.output)
    print(json.dumps({key: report[key] for key in ("source_revision", "discovered", "indexed", "excluded", "source_preservation_verified", "corpus_sha256")}, indent=2))


if __name__ == "__main__":
    main()
