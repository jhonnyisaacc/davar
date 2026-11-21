from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import PurePosixPath
from typing import Callable, Iterator

from .. import adapters
from ..core import (
    digest,
    encoded,
    lexical_refs,
    make_passage,
    normalize_tag,
    provenance,
)


SEGMENTATION = "/"


class Reason(StrEnum):
    ENTITY_KIND_OUTSIDE_CONTRACT = "entity_kind_outside_contract"
    PREDICATE_OUTSIDE_CONTRACT = "predicate_outside_contract"
    CONTEXTUAL_RELATION_REQUIRES_SCOPE = "contextual_relation_requires_scope"
    ENDPOINT_OUTSIDE_CONTRACT = "endpoint_outside_contract"
    DANGLING_ENDPOINT = "dangling_endpoint"
    DANGLING_TARGET = "dangling_target"
    CONTAINS_HOST_PATH = "contains_host_path"
    EMPTY_TEXT = "empty_text"
    UNSUPPORTED_LEXICAL_CODE = "unsupported_lexical_code"


@dataclass(frozen=True)
class Input:
    family_id: str
    relpath: str
    pin: dict
    data: bytes

    @property
    def id(self) -> str:
        return self.pin["id"]

    @property
    def source_id(self) -> str:
        return "source:" + self.pin["id"]


@dataclass(frozen=True)
class Unit:
    input: Input
    pointer: str
    value: object
    ancestors: tuple


@dataclass(frozen=True)
class Context:
    edition_id: str | None
    id_namespace: str | None
    book_id: str | None
    chapter: int | None
    mappings: dict
    aliases: list


@dataclass(frozen=True)
class UnresolvedRef:
    raw: str
    reason: str


@dataclass
class Normalized:
    records: dict[str, list[dict]]
    references: list[UnresolvedRef] = field(default_factory=list)


@dataclass(frozen=True)
class Unresolved:
    reason: Reason


Outcome = Normalized | Unresolved


@dataclass(frozen=True)
class Adapter:
    parse: Callable[[bytes], object]
    pattern: str
    normalize: Callable[[Unit, Context], Outcome]
    shard: str
    source_kind: str
    book: Callable[[str, list], str | None]
    count: Callable[[object], int]
    bare_tokens: bool = False

    @property
    def depth(self) -> int:
        return len(self.pattern.split("/")) - 1 if self.pattern else 0


def escape(key) -> str:
    return str(key).replace("~", "~0").replace("/", "~1")


def unescape(part: str) -> str:
    return part.replace("~1", "/").replace("~0", "~")


def walk(value, pattern: str) -> Iterator[tuple[str, object, tuple]]:
    def go(node, pointer, rest, ancestors):
        if not rest:
            yield pointer, node, ancestors
            return
        head, tail = rest[0], rest[1:]
        if head != "*":
            yield from go(node[head], f"{pointer}/{head}", tail, ancestors + (node,))
            return
        if isinstance(node, list):
            items = enumerate(node)
        elif isinstance(node, dict):
            items = sorted(node.items())
        else:
            raise ValueError(f"Expected a collection at {pointer or '/'}")
        for key, child in items:
            yield from go(child, f"{pointer}/{escape(key)}", tail, ancestors + (node,))

    yield from go(value, "", pattern.split("/")[1:] if pattern else [], ())


def unit_pointer(pointer: str, depth: int) -> str:
    parts = pointer.split("/")[1:][:depth]
    return "".join("/" + part for part in parts)


def chapter_of(relpath: str) -> int | None:
    stem = PurePosixPath(relpath).stem
    return int(stem) if stem.isdigit() else None


def book_by_directory(relpath: str, books: list) -> str:
    return known_book(relpath.split("/")[0], books)


def book_by_oe_directory(relpath: str, books: list) -> str:
    slug = relpath.split("/")[0]
    matches = [b["id"] for b in books if b.get("oe") == slug]
    if len(matches) != 1:
        raise ValueError("Unknown OE book directory: " + slug)
    return matches[0]


def book_by_stem(relpath: str, books: list) -> str:
    return known_book(PurePosixPath(relpath).stem, books)


def no_book(relpath: str, books: list) -> None:
    return None


def known_book(book_id: str, books: list) -> str:
    if book_id not in {b["id"] for b in books}:
        raise ValueError("Unknown book: " + book_id)
    return book_id


def same_chapter(verse: dict, ctx: Context) -> int:
    if ctx.chapter is not None and verse["chapter"] != ctx.chapter:
        raise ValueError(f"Verse chapter {verse['chapter']} differs from its file")
    return verse["chapter"]


def oe_unit(unit: Unit, ctx: Context) -> Outcome:
    same_chapter(unit.value, ctx)
    passage, tokens = adapters.oe_passage(
        unit.value,
        ctx.book_id,
        unit.pointer,
        ctx.mappings,
        edition=ctx.edition_id,
        source_id=unit.input.source_id,
    )
    return Normalized({"passages": [passage], "tokens": tokens})


def delitzsch_unit(unit: Unit, ctx: Context) -> Outcome:
    verse, where = unit.value, unit.input.id + unit.pointer
    text = verse["hebrew"].replace(SEGMENTATION, "")
    words = [{"text": word["text"]} for word in verse["words"]]
    if not words:
        raise ValueError("Delitzsch verse has no words: " + where)
    if "".join(text.split()) != "".join(w["text"] for w in words):
        raise ValueError("Delitzsch words differ from the verse text: " + where)
    passage, tokens = make_passage(
        ctx.edition_id,
        ctx.book_id,
        same_chapter(verse, ctx),
        str(verse["verse"]),
        text,
        words,
        unit.input.source_id,
        unit.pointer,
        ctx.mappings,
        language="he",
    )
    return Normalized({"passages": [passage], "tokens": tokens})


def greek_unit(unit: Unit, ctx: Context) -> Outcome:
    same_chapter(unit.value, ctx)
    passage, tokens = adapters.greek_passage(
        unit.value,
        ctx.book_id,
        unit.pointer,
        ctx.mappings,
        edition=ctx.edition_id,
        source_id=unit.input.source_id,
    )
    return Normalized({"passages": [passage], "tokens": tokens})


def bes_unit(unit: Unit, ctx: Context) -> Outcome:
    verse, chapter = unit.value, unit.ancestors[-2]["chapter"]
    if not verse["bes"].strip():
        return Unresolved(Reason.EMPTY_TEXT)
    passage, _ = make_passage(
        ctx.edition_id,
        ctx.book_id,
        chapter,
        str(verse["verse"]),
        verse["bes"],
        [],
        unit.input.source_id,
        unit.pointer,
        ctx.mappings,
        language="es",
    )
    footnotes = [
        dict(
            id=f"evidence:{passage['id']}:footnote:{j}",
            kind="footnote",
            targets=[{"kind": "passage", "id": passage["id"]}],
            content=note,
            provenance=provenance(
                unit.input.source_id, f"{unit.pointer}/footnotes/{j}"
            ),
        )
        for j, note in enumerate(verse["footnotes"])
    ]
    return Normalized({"passages": [passage], "evidence": footnotes})


def lexicon_unit(unit: Unit, ctx: Context) -> Outcome:
    code = unescape(unit.pointer[1:])
    if len(lexical_refs(code)) != 1:
        return Unresolved(Reason.UNSUPPORTED_LEXICAL_CODE)
    spec = dict(input_id=unit.input.id, id_namespace=ctx.id_namespace, codes=[code])
    blob = {unit.input.id: encoded({code: unit.value})}
    return Normalized({"evidence": adapters.lexical(blob, [spec])})


SHAUL_ENTITY_FOLDERS = {"concepts": "concept", "words": "word"}
SHAUL_OUTSIDE_FOLDERS = {"verses": "verse", "persons": "person", "books": "book"}
SCOPED_PREDICATES = {"related_to", "associated_with"}
UNMAPPED_PREDICATES = {"contains", "mentions"}


def note_evidence_id(upstream_id: str) -> str:
    return "shaul:evidence:note:" + upstream_id


def in_contract(entity: str) -> bool:
    return entity.split(":", 1)[0] in SHAUL_ENTITY_FOLDERS.values()


def shaul_record_unit(unit: Unit, ctx: Context) -> Outcome:
    data, folder = unit.value, unit.input.relpath.split("/")[0]
    blobs = {unit.input.id: unit.input.data}
    spec = dict(input_id=unit.input.id)
    expected_type = {**SHAUL_ENTITY_FOLDERS, **SHAUL_OUTSIDE_FOLDERS}.get(folder)
    if expected_type is not None and data["type"] != expected_type:
        raise ValueError(f"Shaul {folder} record has type {data['type']}")
    if folder in SHAUL_ENTITY_FOLDERS:
        concepts, _, _ = adapters.shaul(blobs, [], {}, [{**spec, "adapter": "entity"}])
        return Normalized({"concepts": concepts})
    if folder in SHAUL_OUTSIDE_FOLDERS:
        return Unresolved(Reason.ENTITY_KIND_OUTSIDE_CONTRACT)
    if folder == "mentions":
        targets = [adapters.shaul_target(e) for e in data["entities"] if in_contract(e)]
        targets.append({"kind": "evidence", "id": note_evidence_id(data["note"])})
        references = [
            UnresolvedRef(e, Reason.ENDPOINT_OUTSIDE_CONTRACT)
            for e in data["entities"]
            if not in_contract(e)
        ]
        _, evidence, _ = adapters.shaul(
            blobs, [], {}, [{**spec, "adapter": "mention", "targets": targets}]
        )
        return Normalized({"evidence": evidence}, references)
    if folder != "relations":
        raise ValueError("Unknown Shaul knowledge folder: " + folder)
    if data["type"] in SCOPED_PREDICATES:
        return Unresolved(Reason.CONTEXTUAL_RELATION_REQUIRES_SCOPE)
    if data["type"] in UNMAPPED_PREDICATES:
        return Unresolved(Reason.PREDICATE_OUTSIDE_CONTRACT)
    if not (in_contract(data["source"]) and in_contract(data["target"])):
        return Unresolved(Reason.ENDPOINT_OUTSIDE_CONTRACT)
    _, _, relations = adapters.shaul(
        blobs, [], {}, [{**spec, "adapter": "relation", "evidence_ids": []}]
    )
    return Normalized({"relations": relations})


HOST_PATH = re.compile(r"/Users/|/home/|[A-Za-z]:\\")


def note_sections(data: bytes) -> list[dict]:
    _, body = adapters.note_parts(data)
    lines = body.splitlines(keepends=True)
    offset = len(data) - len(body.encode("utf-8"))
    starts = [offset]
    for line in lines:
        starts.append(starts[-1] + len(line.encode("utf-8")))
    headings = adapters.unfenced_level_two_headings(lines)
    sections = []
    for n, (i, heading) in enumerate(headings):
        end = starts[headings[n + 1][0]] if n + 1 < len(headings) else starts[-1]
        sections.append(
            dict(
                heading=heading,
                start=starts[i],
                end=end,
                sha256=digest(data[starts[i] : end]),
            )
        )
    return sections


def shaul_note_unit(unit: Unit, ctx: Context) -> Outcome:
    data = unit.input.data
    if HOST_PATH.search(data.decode("utf-8")):
        return Unresolved(Reason.CONTAINS_HOST_PATH)
    metadata, _ = adapters.note_parts(data)
    if not isinstance(metadata, dict):
        raise ValueError("Note frontmatter must be a mapping: " + unit.input.id)
    references = [
        normalize_tag(tag, ctx.aliases, ctx.mappings)
        for tag in metadata.get("references") or []
    ]
    targets = []
    for ref in references:
        target = {"kind": "reference", "reference": ref.get("reference")}
        if ref["status"] == "mapped" and target not in targets:
            targets.append(target)
    unresolved = [
        UnresolvedRef(r["raw"], r["reason"])
        for r in references
        if r["status"] != "mapped"
    ]
    upstream_id = unit.input.relpath.removesuffix(".md")
    evidence = dict(
        id=note_evidence_id(upstream_id),
        kind="note",
        targets=targets,
        content=dict(
            upstream_id=upstream_id,
            metadata=metadata,
            references=references,
            sections=note_sections(data),
        ),
        provenance=provenance(unit.input.source_id, "", kind="yaml", authored=True),
    )
    return Normalized({"evidence": [evidence]}, unresolved)


def objects_with(key: str) -> Callable[[object], int]:
    def count(node) -> int:
        if isinstance(node, dict):
            return (key in node) + sum(count(v) for v in node.values())
        if isinstance(node, list):
            return sum(count(v) for v in node)
        return 0

    return count


def one(parsed) -> int:
    return 1


def scripture(normalize, book, pattern, key="verse", bare=False) -> Adapter:
    return Adapter(
        json.loads,
        pattern,
        normalize,
        "records/{family}/{relpath}",
        "dataset",
        book,
        objects_with(key),
        bare,
    )


ADAPTERS: dict[str, Adapter] = {
    "oe": scripture(oe_unit, book_by_oe_directory, "/*"),
    "delitzsch": scripture(
        delitzsch_unit, book_by_directory, "/*/verses/*", bare=True
    ),
    "greek": scripture(greek_unit, book_by_directory, "/verses/*", "verse_id"),
    "bes": scripture(bes_unit, book_by_stem, "/chapters/*/verses/*"),
    "lexicon": Adapter(
        json.loads,
        "/*",
        lexicon_unit,
        "records/{family}/{relpath}",
        "lexicon",
        no_book,
        len,
    ),
    "shaul-record": Adapter(
        adapters.load_yaml,
        "",
        shaul_record_unit,
        "records/shaul.json",
        "knowledge_record",
        no_book,
        one,
    ),
    "shaul-note": Adapter(
        bytes,
        "",
        shaul_note_unit,
        "records/shaul.json",
        "published_note",
        no_book,
        one,
    ),
}
