"""Bounded read-only adapters. Source corrections and semantic inference are excluded."""

from __future__ import annotations

import json
import re

import yaml

from .core import lexical_refs, make_passage, normalize_tag, provenance


class SourceLoader(yaml.SafeLoader):
    """Keep source dates as JSON strings; never mutate PyYAML's global loader."""

    yaml_implicit_resolvers = {
        key: [
            (tag, pattern)
            for tag, pattern in values
            if tag != "tag:yaml.org,2002:timestamp"
        ]
        for key, values in yaml.SafeLoader.yaml_implicit_resolvers.items()
    }


def load_yaml(data):
    return yaml.load(data, Loader=SourceLoader)


def greek_passage(
    verse: dict,
    book: str,
    pointer: str,
    mappings: dict,
    *,
    edition="sblgnt-tagnt",
    source_id="source:greek",
):
    """Preserve nonnumeric native labels; never infer a canonical verse from them."""
    return make_passage(
        edition,
        book,
        verse["chapter"],
        verse["verse_id"],
        verse["text"],
        verse["words"],
        source_id,
        pointer,
        mappings,
        verse.get("source_ref"),
        language="grc",
    )


def oe_passage(
    verse: dict,
    book: str,
    pointer: str,
    mappings: dict,
    *,
    edition="oe",
    source_id="source:oe",
):
    """Normalize OE's explicit H/A morphology language markers once at ingestion."""
    languages = []
    for word in verse["words"]:
        marker = word.get("morph", "")[:1]
        if marker not in ("H", "A"):
            raise ValueError("OE word lacks a supported source language marker")
        languages.append({"H": "he", "A": "arc"}[marker])
    if not languages:
        raise ValueError("OE passage has no language-bearing words")
    language = languages[0] if len(set(languages)) == 1 else "mul"
    return make_passage(
        edition,
        book,
        verse["chapter"],
        str(verse["verse"]),
        verse["hebrew"],
        verse["words"],
        source_id,
        pointer,
        mappings,
        language=language,
        token_languages=languages,
    )


def scripture(blobs: dict, mappings: dict, selections: list):
    passages, tokens, evidence = [], [], []
    for spec in selections:
        data = json.loads(blobs[spec["input_id"]])
        adapter = spec["adapter"]
        if adapter == "oe":
            rows = [
                (v["chapter"], str(v["verse"]), f"/{i}", v) for i, v in enumerate(data)
            ]
        elif adapter == "greek":
            rows = [
                (v["chapter"], v["verse_id"], f"/verses/{i}", v)
                for i, v in enumerate(data["verses"])
            ]
        elif adapter in ("delitzsch", "tth"):
            chapters = data if adapter == "delitzsch" else data["chapters"]
            prefix = "" if adapter == "delitzsch" else "/chapters"
            rows = [
                (c["chapter"], str(v["verse"]), f"{prefix}/{j}/verses/{i}", v)
                for j, c in enumerate(chapters)
                for i, v in enumerate(c["verses"])
            ]
        else:
            raise ValueError("Unsupported scripture adapter: " + adapter)
        for selected in spec["passages"]:
            matches = [
                row
                for row in rows
                if row[:2] == (selected["chapter"], selected["verse_label"])
            ]
            if len(matches) != 1:
                raise ValueError(
                    "Requested passage missing or ambiguous: " + str(selected)
                )
            chapter, label, pointer, verse = matches[0]
            sid = "source:" + spec["input_id"]
            kwargs = dict(edition=spec["edition_id"], source_id=sid)
            if adapter == "oe":
                p, t = oe_passage(verse, spec["book_id"], pointer, mappings, **kwargs)
            elif adapter == "greek":
                p, t = greek_passage(
                    verse, spec["book_id"], pointer, mappings, **kwargs
                )
            else:
                p, t = make_passage(
                    spec["edition_id"],
                    spec["book_id"],
                    chapter,
                    label,
                    verse["hebrew"] if adapter == "delitzsch" else verse["tth"],
                    verse["words"] if adapter == "delitzsch" else [],
                    sid,
                    pointer,
                    mappings,
                    language="he" if adapter == "delitzsch" else "es",
                )
            passages.append(p)
            tokens.extend(t)
            if adapter == "tth":
                for j, note in enumerate(verse.get("footnotes", [])):
                    evidence.append(
                        dict(
                            id=f"evidence:{p['id']}:footnote:{j}",
                            kind="footnote",
                            targets=[{"kind": "passage", "id": p["id"]}],
                            content=note,
                            provenance=provenance(sid, f"{pointer}/footnotes/{j}"),
                        )
                    )
    return passages, tokens, evidence


def lexical(blobs: dict, selections: list):
    records = []
    for spec in selections:
        entries = json.loads(blobs[spec["input_id"]])
        for code in spec["codes"]:
            if code not in entries:
                raise ValueError("Requested lexical entry missing: " + code)
            entry = entries[code]
            refs = lexical_refs(code)
            if len(refs) != 1:
                raise ValueError("Lexical selection must identify one entry")
            pointer = "/" + code.replace("~", "~0").replace("/", "~1")
            records.append(
                dict(
                    id=f"evidence:{spec['id_namespace']}:{code}",
                    kind="lexical_entry",
                    targets=[{"kind": "external_lexical", "reference": refs[0]}],
                    content={"source_entry_id": code, "lemma": entry["lemma"]},
                    provenance=provenance("source:" + spec["input_id"], pointer),
                )
            )
    return records


def public_note(data: bytes, heading: str):
    text = data.decode("utf-8")
    if not text.startswith("---\n"):
        raise ValueError("Public note needs YAML frontmatter")
    header, body = text[4:].split("\n---", 1)
    metadata = load_yaml(header)
    # Match complete second-level headings, not prefixes or headings in fenced code.
    lines = body.splitlines(keepends=True)
    headings, fence = [], None
    for i, line in enumerate(lines):
        match = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if match:
            marker = match[1]
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
        elif fence is None and line.startswith("## "):
            headings.append((i, line[3:].strip()))
    matches = [i for i, title in headings if title == heading]
    if len(matches) != 1:
        raise ValueError("Requested Markdown section missing or ambiguous")
    start = matches[0]
    end = next((i for i, _ in headings if i > start), len(lines))
    return metadata, heading, "".join(lines[start + 1 : end]).strip()


def shaul_target(raw: str):
    kind, key = raw.split(":", 1)
    if kind not in ("concept", "word") or not key:
        raise ValueError("Unsupported Shaul entity reference: " + raw)
    kind = "expression" if kind == "word" else kind
    return {"kind": kind, "id": f"shaul:{kind}:{key}"}


def shaul(blobs: dict, aliases: list, mappings: dict, selections: list):
    concepts, evidence, relations = [], [], []
    for spec in selections:
        sid = "source:" + spec["input_id"]
        adapter = spec["adapter"]
        if adapter == "note":
            note, heading, section = public_note(
                blobs[spec["input_id"]], spec["heading"]
            )
            evidence.append(
                dict(
                    id=spec["id"],
                    kind="note",
                    targets=spec["targets"],
                    content={
                        "upstream_id": spec["upstream_id"],
                        "metadata": note,
                        "section": section,
                        "references": [
                            normalize_tag(x, aliases, mappings)
                            for x in note.get("references", [])
                        ],
                    },
                    provenance=provenance(sid, heading, kind="markdown", authored=True),
                )
            )
            continue
        data = load_yaml(blobs[spec["input_id"]])
        if adapter == "entity":
            target = shaul_target(f"{data['type']}:{data['id']}")
            concepts.append(
                dict(
                    **target,
                    owner="shaul",
                    upstream_id=f"{data['type']}:{data['id']}",
                    names=data.get("names", {"und": data.get("script", data["id"])}),
                    source_record=data,
                    provenance=provenance(sid, kind="yaml", authored=True),
                )
            )
        elif adapter == "mention":
            evidence.append(
                dict(
                    id="shaul:evidence:" + data["id"],
                    kind="mention",
                    targets=spec["targets"],
                    content=data,
                    provenance=provenance(sid, kind="yaml", authored=True),
                )
            )
        elif adapter == "relation":
            if data["type"] != "expresses":
                raise ValueError("Unsupported Shaul relation type: " + data["type"])
            relations.append(
                dict(
                    id="shaul:relation:" + data["id"],
                    owner="shaul",
                    subject=shaul_target(data["source"]),
                    predicate="expresses_concept",
                    object=shaul_target(data["target"]),
                    evidence_ids=spec["evidence_ids"],
                    upstream_id=data["id"],
                    upstream_status=data["status"],
                    provenance=provenance(sid, kind="yaml", authored=True),
                )
            )
        else:
            raise ValueError("Unsupported Shaul adapter: " + adapter)
    return concepts, evidence, relations
