"""Bounded read-only adapters. Source corrections and semantic inference are excluded."""

from __future__ import annotations

import json

import yaml

from .core import lexical_refs, make_passage, normalize_tag, provenance, reference


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


def greek_passage(verse: dict, book: str, pointer: str, mappings: dict):
    """Preserve nonnumeric native labels; never infer a canonical verse from them."""
    return make_passage(
        "sblgnt-tagnt",
        book,
        verse["chapter"],
        verse["verse_id"],
        verse["text"],
        verse["words"],
        "source:greek",
        pointer,
        mappings,
        verse.get("source_ref"),
        language="grc",
    )


def oe_passage(verse: dict, book: str, pointer: str, mappings: dict):
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
        "oe",
        book,
        verse["chapter"],
        str(verse["verse"]),
        verse["hebrew"],
        verse["words"],
        "source:oe",
        pointer,
        mappings,
        language=language,
        token_languages=languages,
    )


def scripture(blobs: dict, mappings: dict):
    passages, tokens, evidence = [], [], []

    def add(edition, book, chapter, verse, text, words, sid, pointer, *, language):
        p, t = make_passage(
            edition,
            book,
            chapter,
            str(verse),
            text,
            words,
            f"source:{sid}",
            pointer,
            mappings,
            language=language,
        )
        passages.append(p)
        tokens.extend(t)
        return p

    for i, verse in enumerate(json.loads(blobs["oe"])):
        if verse["verse"] == 13:
            p, t = oe_passage(verse, "daniel", f"/{i}", mappings)
            passages.append(p)
            tokens.extend(t)
    for c, chapter in enumerate(json.loads(blobs["delitzsch"])):
        for i, verse in enumerate(chapter["verses"]):
            if verse["verse"] in (1, 51):
                add(
                    "delitzsch",
                    "john",
                    1,
                    verse["verse"],
                    verse["hebrew"],
                    verse["words"],
                    "delitzsch",
                    f"/{c}/verses/{i}",
                    language="he",
                )
    for i, verse in enumerate(json.loads(blobs["greek"])["verses"]):
        if verse["verse"] in (1, 51):
            p, t = greek_passage(verse, "john", f"/verses/{i}", mappings)
            passages.append(p)
            tokens.extend(t)
    for c, chapter in enumerate(json.loads(blobs["tth"])["chapters"]):
        if chapter["chapter"] != 1:
            continue
        for i, verse in enumerate(chapter["verses"]):
            if verse["verse"] not in (1, 51):
                continue
            pointer = f"/chapters/{c}/verses/{i}"
            p = add(
                "tth-es",
                "john",
                1,
                verse["verse"],
                verse["tth"],
                [],
                "tth",
                pointer,
                language="es",
            )
            for j, note in enumerate(verse.get("footnotes", [])):
                evidence.append(
                    dict(
                        id=f"evidence:{p['id']}:footnote:{j}",
                        kind="footnote",
                        targets=[{"kind": "passage", "id": p["id"]}],
                        content=note,
                        provenance=provenance("source:tth", f"{pointer}/footnotes/{j}"),
                    )
                )
    return passages, tokens, evidence


def lexical(blobs: dict):
    records = []
    words = json.loads(blobs["bdb"])
    for code in ("H1247", "H606", "H1697", "H430"):
        entry = words[code]
        records.append(
            dict(
                id=f"evidence:bdb:{code}",
                kind="lexical_entry",
                targets=[
                    {
                        "kind": "external_lexical",
                        "reference": {"namespace": "strong", "code": code},
                    }
                ],
                content={"source_entry_id": code, "lemma": entry["lemma"]},
                provenance=provenance("source:bdb", f"/{code}"),
            )
        )
    greek = json.loads(blobs["greek-lexicon"])
    for code in ("G3056", "G3004G", "G5207", "G0444"):
        entry = greek[code]
        records.append(
            dict(
                id=f"evidence:tagnt:{code}",
                kind="lexical_entry",
                targets=[
                    {"kind": "external_lexical", "reference": lexical_refs(code)[0]}
                ],
                content={"source_entry_id": code, "lemma": entry["lemma"]},
                provenance=provenance("source:greek-lexicon", f"/{code}"),
            )
        )
    return records


def public_note(data: bytes):
    text = data.decode("utf-8")
    if not text.startswith("---\n"):
        raise ValueError("Public note needs YAML frontmatter")
    header, body = text[4:].split("\n---", 1)
    metadata = load_yaml(header)
    heading = "Netanel y las confesiones del final"
    marker = "## " + heading
    section = body.split(marker, 1)[1].split("\n## ", 1)[0].strip()
    return metadata, heading, section


def shaul(blobs: dict, aliases: list, mappings: dict):
    concepts, evidence, relations = [], [], []
    for key in ("son-of-man", "bar-enash-ar", "ben-ha-adam-he"):
        data = load_yaml(blobs["shaul-" + key])
        kind = "concept" if data["type"] == "concept" else "expression"
        concepts.append(
            dict(
                id=f"shaul:{kind}:{data['id']}",
                kind=kind,
                owner="shaul",
                upstream_id=f"{data['type']}:{data['id']}",
                names=data.get("names", {"und": data.get("script", data["id"])}),
                source_record=data,
                provenance=provenance(
                    "source:shaul-" + key, kind="yaml", authored=True
                ),
            )
        )
    mention = load_yaml(blobs["shaul-son-of-man-daniel"])
    evidence.append(
        dict(
            id="shaul:evidence:" + mention["id"],
            kind="mention",
            targets=[{"kind": "reference", "reference": reference("daniel", 7, 13)}],
            content=mention,
            provenance=provenance(
                "source:shaul-son-of-man-daniel", kind="yaml", authored=True
            ),
        )
    )
    note, heading, section = public_note(blobs["shaul-juan_1_testigo_cordero"])
    evidence.append(
        dict(
            id="shaul:evidence:juan_1_testigo_cordero",
            kind="note",
            targets=[{"kind": "reference", "reference": reference("john", 1, 51)}],
            content={
                "upstream_id": "content/besorah/juan_1_testigo_cordero",
                "metadata": note,
                "section": section,
                "references": [
                    normalize_tag(x, aliases, mappings) for x in note["references"]
                ],
            },
            provenance=provenance(
                "source:shaul-juan_1_testigo_cordero",
                heading,
                kind="markdown",
                authored=True,
            ),
        )
    )
    relation = load_yaml(blobs["shaul-bar-enash-expresses-son-of-man"])
    relations.append(
        dict(
            id="shaul:relation:" + relation["id"],
            owner="shaul",
            subject={"kind": "expression", "id": "shaul:expression:bar-enash-ar"},
            predicate="expresses_concept",
            object={"kind": "concept", "id": "shaul:concept:son-of-man"},
            evidence_ids=["shaul:evidence:" + mention["id"]],
            upstream_id=relation["id"],
            upstream_status=relation["status"],
            provenance=provenance(
                "source:shaul-bar-enash-expresses-son-of-man",
                kind="yaml",
                authored=True,
            ),
        )
    )
    return concepts, evidence, relations
