"""Evidence alignment overlay: python -m scripts.knowledge.alignment {build,check}."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Resource

from .build import artifacts
from .core import ROOT, contained, digest, encoded, pinned_inputs, read_json, provenance as v1_provenance
from .validate import Validator

AUTHORED = "data/knowledge/evidence/romans-v1/authored.json"
SCHEMA = "contracts/biblical-knowledge/evidence-alignment/v1/evidence-alignment.schema.json"
FIXTURE = "data/knowledge/generated/evidence-romans-v1/evidence.json"
AUTHORED_SOURCE = "source:authored-evidence-alignment"
GENERATOR_VERSION = "1.0.0"
STAGES = (
    "source_unit",
    "lexical_evidence",
    "existing_translation_evidence",
    "commentary_evidence",
    "candidate_options",
    "structured_decision",
    "review_result",
)
CATEGORY_STAGE = {
    "SOURCE_TEXT": "source_unit",
    "LEXICAL_DATA": "lexical_evidence",
    "EXISTING_TRANSLATION": "existing_translation_evidence",
    "ANCIENT_TEXTUAL_WITNESS": "existing_translation_evidence",
    "COMMENTARY_TEACHING": "commentary_evidence",
    "AI_GENERATED_CANDIDATE": "candidate_options",
    "HUMAN_REVIEWED_DECISION": "structured_decision",
}


def status(provenance: dict, category: str | None = None) -> str:
    if category == "HUMAN_REVIEWED_DECISION" and provenance["review"] in ("approved", "rejected"):
        return "reviewed_decision"
    if provenance["transformation"] in ("generated", "inferred"):
        return provenance["transformation"]
    return "authored" if provenance["origin"] == "authored" else "imported"


def authored_record(pointer: str, authored_sha256: str) -> dict:
    record = v1_provenance(AUTHORED_SOURCE, pointer, authored=True)
    return dict(
        status=status(record),
        review=record["review"],
        provenance=record,
        version={"path": AUTHORED, "sha256": authored_sha256},
    )


def shape(left: int, right: int) -> str:
    return ("one" if left == 1 else "many") + "_to_" + ("one" if right == 1 else "many")


def verse_key(edition_id: str, book_id: str, chapter: int, verse_label: str) -> str:
    return f"verse:{edition_id}:{book_id}:{chapter}:{verse_label}"


def passage_key(passage: dict) -> str:
    native = passage["native_reference"]
    return verse_key(passage["edition_id"], passage["book_id"], native["chapter"], native["verse_label"])


def lexical_unit_id(ref: dict) -> str:
    return f"unit:lexical:{ref['namespace']}:{ref['code']}"


def text_units(records: dict, specs: list[dict]):
    passages = {passage_key(p): p for p in records["passages"]}
    tokens = {}
    for token in records["tokens"]:
        tokens.setdefault(token["source_passage_id"], {})[token["ordinal"]] = token
    units, keys = [], {}
    for key, passage in sorted(passages.items()):
        unit_id = "unit:" + key
        keys[key] = unit_id
        units.append(
            dict(
                id=unit_id,
                level="verse",
                edition_id=passage["edition_id"],
                language=passage["language"],
                references=passage["mapping"]["targets"],
                members=[{"kind": "passage", "id": passage["id"]}],
            )
        )
        for ordinal, token in sorted(tokens.get(passage["id"], {}).items()):
            units.append(
                dict(
                    id="unit:" + token["id"],
                    level="token",
                    edition_id=passage["edition_id"],
                    language=token.get("language", passage["language"]),
                    references=passage["mapping"]["targets"],
                    members=[{"kind": "token", "id": token["id"]}],
                    surface=[token["text"]],
                    lexical_unit_ids=[lexical_unit_id(r) for r in token["lexical_refs"]],
                    verse_unit_id=unit_id,
                )
            )
    for spec in specs:
        if spec["key"] in keys:
            raise ValueError("Duplicate unit key: " + spec["key"])
        passage = passages.get(
            verse_key(spec["edition_id"], spec["book_id"], spec["chapter"], spec["verse_label"])
        )
        if passage is None:
            raise ValueError("Unit spec passage is not in the foundation build: " + spec["key"])
        selected = [tokens.get(passage["id"], {}).get(o) for o in spec["ordinals"]]
        if None in selected or [t["text"] for t in selected] != spec["expected_texts"]:
            raise ValueError("Unit spec text precondition failed: " + spec["key"])
        if len(selected) == 1:
            keys[spec["key"]] = "unit:" + selected[0]["id"]
            continue
        unit_id = f"unit:phrase:{passage['id']}:" + "+".join(map(str, spec["ordinals"]))
        keys[spec["key"]] = unit_id
        units.append(
            dict(
                id=unit_id,
                level="phrase",
                edition_id=passage["edition_id"],
                language=passage["language"],
                references=passage["mapping"]["targets"],
                members=[{"kind": "token", "id": t["id"]} for t in selected],
                surface=[t["text"] for t in selected],
                verse_unit_id="unit:" + passage_key(passage),
            )
        )
    lexical = {
        lexical_unit_id(r): r for t in records["tokens"] for r in t["lexical_refs"]
    }
    units.extend(
        dict(id=unit_id, level="lexical_concept", members=[{"kind": "external_lexical", "reference": ref}])
        for unit_id, ref in sorted(lexical.items())
    )
    return units, keys


def role_for(roles: list[dict], source_id: str, collection: str, kind: str | None) -> dict:
    matches = [
        r
        for r in roles
        if (r["source_id"], r["collection"], r.get("kind")) == (source_id, collection, kind)
    ]
    if len(matches) != 1:
        raise ValueError(f"No single evidence role for {source_id} {collection} {kind}")
    return matches[0]


def evidence(records: dict, roles: list[dict], units: list[dict]) -> list[dict]:
    sources = {s["id"]: s for s in records["sources"]}
    verse_of_passage = {u["members"][0]["id"]: u["id"] for u in units if u["level"] == "verse"}
    verses_of_reference = {}
    for unit in units:
        if unit["level"] == "verse":
            for reference in unit["references"]:
                verses_of_reference.setdefault(encoded(reference), []).append(unit["id"])
    items = [("passages", p, None) for p in records["passages"]]
    items += [("evidence", e, e["kind"]) for e in records["evidence"]]
    result = []
    for collection, record, kind in items:
        provenance = record["provenance"]
        role = role_for(roles, provenance["source_id"], collection, kind)
        source = sources[provenance["source_id"]]
        context = dict(role["context"], locator=provenance["locator"])
        if collection == "passages":
            unit_ids = [verse_of_passage[record["id"]]]
            context.update(edition_id=record["edition_id"], language=record["language"], references=record["mapping"]["targets"])
        else:
            unit_ids = []
            for target in record["targets"]:
                if target["kind"] == "passage":
                    unit_ids.append(verse_of_passage[target["id"]])
                elif target["kind"] == "reference":
                    unit_ids.extend(verses_of_reference.get(encoded(target["reference"]), []))
                elif target["kind"] == "external_lexical":
                    unit_ids.append(lexical_unit_id(target["reference"]))
                else:
                    raise ValueError("Unsupported evidence target: " + target["kind"])
            if kind == "note":
                context.update(
                    teaching_source_ids=record["content"]["metadata"].get("source_ids", []),
                    transcript_segment=None,
                )
        if not unit_ids:
            raise ValueError("Evidence applies to no unit: " + record["id"])
        result.append(
            dict(
                id="aev:" + record["id"],
                category=role["category"],
                role=role["role"],
                status=status(provenance, role["category"]),
                review=provenance["review"],
                unit_ids=sorted(set(unit_ids)),
                record={"collection": collection, "id": record["id"]},
                version={k: source[k] for k in ("repository", "revision", "path", "sha256")} | {"source_id": source["id"]},
                context=context,
                provenance=provenance,
            )
        )
    return result


def alignments(specs: list[dict], keys: dict, units: list[dict], authored_sha256: str) -> list[dict]:
    by_id = {u["id"]: u for u in units}
    result = []
    for index, spec in enumerate(specs):
        source = [keys[k] for k in spec["source"]]
        target = [keys[k] for k in spec["target"]]
        levels = {by_id[u]["level"] for u in source + target}
        if "verse" in levels and levels != {"verse"}:
            raise ValueError("Alignment mixes verse and token units: " + spec["id"])
        if {by_id[u]["edition_id"] for u in source} & {by_id[u]["edition_id"] for u in target}:
            raise ValueError("Alignment sides share an edition: " + spec["id"])
        granularity = "verse" if levels == {"verse"} else "token"

        def count(ids):
            return len(ids) if granularity == "verse" else sum(len(by_id[u]["members"]) for u in ids)

        result.append(
            dict(
                id=spec["id"],
                relation=spec["relation"],
                granularity=granularity,
                source=source,
                target=target,
                counts=[count(source), count(target)],
                shape=shape(count(source), count(target)),
                evidence_ids=["aev:" + e for e in spec.get("evidence_ids", [])],
            )
            | authored_record(f"/alignments/{index}", authored_sha256)
        )
    return result


def inventory(
    records: dict,
    declared: list[dict],
    items: list[dict],
    units: list[dict],
    keys: dict,
    blobs: dict,
    manifest: dict,
    authored_sha256: str,
) -> list[dict]:
    rows = [
        {k: v for k, v in row.items() if k != "applies_to"}
        | ({"unit_ids": sorted(keys[k] for k in row["applies_to"])} if "applies_to" in row else {})
        | authored_record(f"/inventory/{index}", authored_sha256)
        for index, row in enumerate(declared)
    ]
    for source in records["sources"]:
        owned = [e["id"] for e in items if e["version"]["source_id"] == source["id"]]
        if owned:
            categories = sorted({e["category"] for e in items if e["version"]["source_id"] == source["id"]})
            rows.append(dict(id="inventory:" + source["id"], availability="available", subject=source["path"], categories=categories, evidence_count=len(owned)))
        elif not any(r.get("covers", {}).get("input_id") == source["id"].removeprefix("source:") for r in declared):
            raise ValueError("Pinned source has neither evidence nor an inventory row: " + source["id"])
    lexical = {u["id"]: u["members"][0]["reference"] for u in units if u["level"] == "lexical_concept"}
    covered = {
        (lexical[unit_id]["namespace"], lexical[unit_id]["code"])
        for e in items
        if e["category"] == "LEXICAL_DATA"
        for unit_id in e["unit_ids"]
    }
    lexicons = {
        e["version"]["source_id"].removeprefix("source:")
        for e in items
        if e["category"] == "LEXICAL_DATA"
    }
    parsed = {i["id"]: json.loads(blobs[i["id"]]) for i in manifest["inputs"] if i["path"].endswith(".json")}
    refs = sorted({(r["namespace"], r["code"]) for t in records["tokens"] for r in t["lexical_refs"]})
    for namespace, code in refs:
        if (namespace, code) in covered:
            continue
        if any(code in parsed[i] for i in lexicons):
            raise ValueError("Profile omits an available lexical entry: " + code)
        owners = [
            r["id"]
            for r in declared
            if r.get("covers", {}).get("namespace") == namespace
            or code in parsed.get(r.get("covers", {}).get("input_id"), {})
        ]
        rows.append(
            dict(
                id=f"inventory:gap:{namespace}:{code}",
                availability="gap",
                subject=code,
                category="LEXICAL_DATA",
                unit_ids=[lexical_unit_id({"namespace": namespace, "code": code})],
                reason=(
                    "No selectable lexicon entry; data without a connector: " + ", ".join(owners)
                    if owners
                    else "Absent from every pinned lexicon"
                ),
            )
        )
    return rows


def fixture(root: Path = ROOT) -> bytes:
    authored_bytes = contained(root, AUTHORED).read_bytes()
    authored = json.loads(authored_bytes)
    files = artifacts(root, authored["profile"])
    records = json.loads(files["records/records.json"])
    profile = read_json(contained(root, authored["profile"]))
    manifest, blobs = pinned_inputs(root, profile["input_manifest"], validator=Validator(root))
    units, keys = text_units(records, authored["units"])
    items = evidence(records, authored["roles"], units)
    authored_sha256 = digest(authored_bytes)
    rows = inventory(records, authored["inventory"], items, units, keys, blobs, manifest, authored_sha256)
    value = dict(
        contract_version="1.0.0",
        generator_version=GENERATOR_VERSION,
        scope=authored["scope"],
        through_stage=authored["through_stage"],
        foundation=dict(
            profile=authored["profile"],
            input_manifest_digest=json.loads(files["manifest.json"])["input_manifest_digest"],
            records_sha256=digest(files["records/records.json"]),
        ),
        authored={"path": AUTHORED, "sha256": authored_sha256},
        schema_sha256=digest(contained(root, SCHEMA).read_bytes()),
        sources=sorted(
            records["sources"]
            + [
                dict(
                    id=AUTHORED_SOURCE,
                    owner="davar",
                    kind="authored_mapping",
                    repository="https://github.com/jhonnyisaacc/davar",
                    revision="sha256:" + authored_sha256,
                    path=AUTHORED,
                    sha256=authored_sha256,
                    visibility="public",
                )
            ],
            key=lambda s: s["id"],
        ),
        units=sorted(units, key=lambda u: u["id"]),
        evidence=sorted(items, key=lambda e: e["id"]),
        alignments=sorted(alignments(authored["alignments"], keys, units, authored_sha256), key=lambda a: a["id"]),
        inventory=sorted(rows, key=lambda r: r["id"]),
    )
    validate(value, records, root)
    return encoded(value)


def schema_validator(root: Path = ROOT, definition: str | None = None) -> Draft202012Validator:
    schema = read_json(contained(root, SCHEMA))
    registry = Validator(root).registry.with_resource(schema["$id"], Resource.from_contents(schema))
    target = {"$ref": f"{schema['$id']}#/$defs/{definition}"} if definition else schema
    return Draft202012Validator(target, registry=registry)


def validate(value: dict, records: dict, root: Path = ROOT) -> None:
    schema_validator(root).validate(value)
    roles = read_json(contained(root, AUTHORED))["roles"]
    foundation = {c: {r["id"]: r for r in records[c]} for c in ("passages", "tokens", "evidence")}
    known = foundation["passages"] | foundation["tokens"] | foundation["evidence"]
    units = {u["id"]: u for u in value["units"]}
    ids = [u["id"] for u in value["units"]] + [e["id"] for e in value["evidence"]] + [a["id"] for a in value["alignments"]] + [r["id"] for r in value["inventory"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate overlay ID")
    limit = STAGES.index(value["through_stage"])
    for unit in value["units"]:
        for member in unit["members"]:
            if "id" in member and member["id"] not in known:
                raise ValueError("Unit member is not a foundation record: " + member["id"])
        if "surface" in unit and unit["surface"] != [known[m["id"]]["text"] for m in unit["members"]]:
            raise ValueError("Unit surface differs from foundation tokens: " + unit["id"])
        for unit_id in unit.get("lexical_unit_ids", []) + [unit.get("verse_unit_id", unit["id"])]:
            if unit_id not in units:
                raise ValueError("Unit links an unknown unit: " + unit_id)
    sources = {s["id"] for s in value["sources"]}
    authored = value["alignments"] + [r for r in value["inventory"] if "provenance" in r]
    for record, category in [(e, e["category"]) for e in value["evidence"]] + [(r, None) for r in authored]:
        if record["provenance"]["source_id"] not in sources:
            raise ValueError("Provenance source is not listed: " + record["id"])
        if record["status"] != status(record["provenance"], category):
            raise ValueError("Status contradicts provenance: " + record["id"])
        if record["review"] != record["provenance"]["review"]:
            raise ValueError("Review state contradicts provenance: " + record["id"])
    for item in value["evidence"]:
        if STAGES.index(CATEGORY_STAGE[item["category"]]) > limit:
            raise ValueError("Evidence category is beyond this fixture's stage: " + item["id"])
        collection = item["record"]["collection"]
        record = foundation[collection].get(item["record"]["id"])
        if record is None or record["provenance"] != item["provenance"]:
            raise ValueError("Evidence provenance differs from its foundation record: " + item["id"])
        role = role_for(roles, record["provenance"]["source_id"], collection, record.get("kind") if collection == "evidence" else None)
        if (item["category"], item["role"]) != (role["category"], role["role"]):
            raise ValueError("Evidence category or role differs from the role registry: " + item["id"])
        if not set(item["unit_ids"]) <= units.keys():
            raise ValueError("Evidence targets an unknown unit: " + item["id"])
    evidence_ids = {e["id"] for e in value["evidence"]}
    for alignment in value["alignments"]:
        if not set(alignment["source"] + alignment["target"]) <= units.keys():
            raise ValueError("Alignment endpoint is not a unit: " + alignment["id"])
        if shape(*alignment["counts"]) != alignment["shape"]:
            raise ValueError("Alignment shape contradicts its counts: " + alignment["id"])
        if not set(alignment["evidence_ids"]) <= evidence_ids:
            raise ValueError("Alignment cites unknown evidence: " + alignment["id"])
    for row in value["inventory"]:
        if not set(row.get("unit_ids", [])) <= units.keys():
            raise ValueError("Inventory row names an unknown unit: " + row["id"])


def drift(value: dict, root: Path = ROOT) -> list[str]:
    return sorted(
        [f"missing: {p}" for r in value["inventory"] for p in r.get("paths", []) if not contained(root, p).exists()]
        + [f"present: {p}" for r in value["inventory"] for p in r.get("absent_paths", []) if contained(root, p).exists()]
    )


def load(root: Path = ROOT) -> dict:
    return read_json(contained(root, FIXTURE))


def trace(value: dict, unit_id: str) -> dict[str, list[str]]:
    units = {u["id"]: u for u in value["units"]}
    token_unit = {u["members"][0]["id"]: u["id"] for u in units.values() if u["level"] == "token"}
    partners = {}
    for alignment in value["alignments"]:
        sides = alignment["source"] + alignment["target"]
        for side in sides:
            partners.setdefault(side, set()).update(sides)
    start = [unit_id]
    if units[unit_id]["level"] == "verse":
        start += [u["id"] for u in units.values() if u.get("verse_unit_id") == unit_id]
    reached, frontier = set(), start
    while frontier:
        current = frontier.pop()
        if current in reached:
            continue
        reached.add(current)
        unit = units[current]
        frontier.extend(unit.get("lexical_unit_ids", []))
        frontier.extend(partners.get(current, ()))
        if "verse_unit_id" in unit:
            frontier.append(unit["verse_unit_id"])
        if unit["level"] == "phrase":
            frontier.extend(token_unit[m["id"]] for m in unit["members"])
        if unit["level"] == "token":
            frontier.extend(
                u["id"] for u in units.values() if u["level"] == "phrase" and unit["members"][0] in u["members"]
            )
    stages = {}
    for item in value["evidence"]:
        if reached & set(item["unit_ids"]):
            stages.setdefault(item["category"], []).append(item["id"])
    for row in value["inventory"]:
        if reached & set(row.get("unit_ids", [])):
            stages.setdefault(row["category"], []).append(row["id"])
    return {k: stages[k] for k in sorted(stages, key=lambda c: STAGES.index(CATEGORY_STAGE[c]))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build", "check"])
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root.resolve()
    data = fixture(root)
    path = contained(root, FIXTURE)
    if args.command == "build":
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    elif not path.is_file() or path.read_bytes() != data:
        raise ValueError("Committed evidence alignment fixture is stale")
    for line in drift(json.loads(data), root):
        print("warning: inventory path claim differs from the checkout, " + line, file=sys.stderr)
    print(f"evidence alignment {args.command}: OK")


if __name__ == "__main__":
    main()
