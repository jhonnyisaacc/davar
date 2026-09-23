"""Portable identity, source pinning and reference normalization."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE = Path("data/knowledge")
OUTPUT = KNOWLEDGE / "generated/pilot-v1"
COLLECTIONS = {
    "editions": "edition",
    "passages": "passage",
    "tokens": "token",
    "spans": "span",
    "sources": "source",
    "evidence": "evidence",
    "concepts": "concept",
    "relations": "relation",
}
SOURCES = {
    "shaul": {
        "adapter": "shaul",
        "owner": "shaul",
        "profile_group": "shaul",
        "cli_flag": "--shaul-root",
        "alias_namespace": "shaul",
        "verified_mappings": "shaul_verified",
        "path_prefixes": ("content/", "knowledge/"),
        "record_kind": "knowledge_record",
    }
}


def cli_dest(flag: str) -> str:
    return flag.removeprefix("--").replace("-", "_")


def resolve_roots(source_roots: dict) -> dict[str, Path]:
    by_dest = {cli_dest(row["cli_flag"]): kind for kind, row in SOURCES.items()}
    resolved = {}
    for name, path in source_roots.items():
        if name not in by_dest:
            raise TypeError(f"Unexpected source root: {name}")
        if path is not None:
            resolved[by_dest[name]] = path
    return resolved


def source_for_owner(owner: str):
    for kind, row in SOURCES.items():
        if row["owner"] == owner:
            return kind, row
    return None, None


def encoded(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        + "\n"
    ).encode("utf-8")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def contained(root: Path, relative: str) -> Path:
    path = root / relative
    if Path(relative).is_absolute() or ".." in Path(relative).parts:
        raise ValueError(f"Unsafe relative path: {relative}")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Path escapes input root: {relative}")
    return path


def pinned_inputs(root: Path, manifest_path=None, **source_roots):
    manifest = read_json(
        contained(root, manifest_path or "data/knowledge/pilot-inputs.json")
    )
    from .validate import Validator

    Validator(root).schema("input-manifest", manifest)
    roots = resolve_roots(source_roots)
    blobs = {}
    for item in manifest["inputs"]:
        if item["id"] in blobs:
            raise ValueError("Duplicate input ID")
        kind, row = source_for_owner(item["owner"])
        if row is not None:
            if not item["path"].startswith(row["path_prefixes"]):
                raise ValueError(
                    f"Only public {row['owner'].title()} notes and knowledge are allowed"
                )
            external = roots.get(kind)
            path = (
                contained(external, item["path"])
                if external is not None
                else contained(root, item["fixture_path"])
            )
        else:
            path = contained(root, item["path"])
        data = path.read_bytes()
        if digest(data) != item["sha256"]:
            raise ValueError(f"Pinned input drift: {item['id']}")
        blobs[item["id"]] = data
    return manifest, blobs


def reference(book: str, chapter: int, verse: int) -> dict:
    return dict(
        system_id="davar-v1", book_id=book, kind="verse", chapter=chapter, verse=verse
    )


def provenance(source_id: str, pointer: str = "", *, kind="json", authored=False):
    locator = {"kind": kind, "heading" if kind == "markdown" else "pointer": pointer}
    return dict(
        source_id=source_id,
        locator=locator,
        origin="authored" if authored else "source",
        transformation="normalized",
        review="unreviewed",
        publication="draft",
        visibility="public",
    )


def lexical_refs(raw: str | None) -> list[dict]:
    refs = []
    for code in (raw or "").split("/"):
        if not code:
            continue
        namespace = (
            "strong"
            if re.fullmatch(r"[HG]\d+", code)
            else "tagnt"
            if re.fullmatch(r"G\d+[A-Za-z]+", code)
            else "davar-prefix"
            if re.fullmatch(r"H[a-z]+", code)
            else "davar-custom"
        )
        refs.append({"namespace": namespace, "code": code})
    return refs


def normalize_tag(tag: str, aliases: list, mappings: dict) -> dict:
    match = re.fullmatch(r"#(.+)_(\d+)_(\d+)(?:-(\d+))?", tag)
    chapter_match = re.fullmatch(r"#(.+)_(\d+)", tag) if match is None else None
    parsed = match or chapter_match
    if parsed is None:
        return {"raw": tag, "status": "unresolved", "reason": "unsupported_tag"}
    namespaces = {row["alias_namespace"] for row in SOURCES.values()}
    books = {
        x["book_id"]
        for x in aliases
        if x["namespace"] in namespaces and x["alias"] == parsed[1]
    }
    if len(books) != 1:
        return {
            "raw": tag,
            "status": "unresolved",
            "reason": "unknown_or_ambiguous_alias",
        }
    chapter = int(parsed[2])
    if chapter < 1 or (
        match and (int(match[3]) < 1 or (match[4] and int(match[4]) < int(match[3])))
    ):
        raise ValueError(f"Invalid reference: {tag}")
    verified = None
    for row in SOURCES.values():
        verified = next(
            (
                x["reference"]
                for x in mappings[row["verified_mappings"]]
                if x["tag"] == tag
            ),
            None,
        )
        if verified:
            break
    if verified:
        return {"raw": tag, "status": "mapped", "reference": verified}
    return {
        "raw": tag,
        "status": "unresolved",
        "book_id": next(iter(books)),
        "reason": "reference_system_not_verified",
    }


def make_passage(
    edition: str,
    book: str,
    chapter: int,
    label: str,
    text: str,
    words: list,
    source_id: str,
    pointer: str,
    mappings: dict,
    source_ref: str | None = None,
    *,
    language: str,
    token_languages: list[str] | None = None,
):
    if token_languages is not None and len(token_languages) != len(words):
        raise ValueError("Token language count must match source words")
    if language == "mul" and (
        not words or token_languages is None or "mul" in token_languages
    ):
        raise ValueError(
            "Mixed-language passages require a concrete language for every token"
        )
    native = {"chapter": chapter, "verse_label": label}
    if source_ref:
        native["source_ref"] = source_ref
    policy = "source-array-v1" if words else "untokenized-v1"
    # Deliberately excludes annotations, git revision and host filesystem paths.
    identity = dict(
        edition_id=edition,
        book_id=book,
        native_reference=native,
        text=text,
        surfaces=[w["text"] for w in words],
        tokenization_policy=policy,
    )
    snapshot = digest(encoded(identity))
    pid = f"passage:{edition}:{book}:{chapter}:{snapshot}"
    targets = [
        m["target"]
        for m in mappings["passages"]
        if (m["edition_id"], m["book_id"], m["chapter"], m["verse_label"])
        == (edition, book, chapter, label)
    ]
    passage = dict(
        id=pid,
        edition_id=edition,
        book_id=book,
        native_reference=native,
        mapping={"status": "mapped" if targets else "unresolved", "targets": targets},
        language=language,
        text=text,
        text_snapshot=snapshot,
        tokenization_policy=policy,
        provenance=provenance(source_id, pointer),
    )
    tokens = []
    for ordinal, word in enumerate(words, 1):
        if "position" in word and word["position"] != ordinal:
            raise ValueError("Greek position does not match retained token order")
        token = dict(
            id=f"token:{pid}:{ordinal}",
            source_passage_id=pid,
            ordinal=ordinal,
            text=word["text"],
            lexical_refs=lexical_refs(word.get("strong")),
            annotations={
                k: v
                for k, v in word.items()
                if k not in {"text", "position", "index", "ref", "strong"}
            },
            provenance=provenance(source_id, f"{pointer}/words/{ordinal - 1}"),
        )
        if "index" in word:
            token["source_index"] = word["index"]
        if token_languages is not None and token_languages[ordinal - 1] != language:
            token["language"] = token_languages[ordinal - 1]
        if "ref" in word:
            token["source_token_ref"] = word["ref"]
        tokens.append(token)
    return passage, tokens
