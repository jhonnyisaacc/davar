"""Offline Draft 2020-12 validation and domain integrity checks."""

from __future__ import annotations

from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from .core import COLLECTIONS, ROOT, digest, encoded, read_json

SCHEMAS = Path("contracts/biblical-knowledge/v1")


class Validator:
    def __init__(self, root: Path = ROOT):
        self.schemas = {
            p.stem.removesuffix(".schema"): read_json(p)
            for p in sorted((root / SCHEMAS).glob("*.schema.json"))
        }
        for schema in self.schemas.values():
            Draft202012Validator.check_schema(schema)
        # Registry has no network retriever. Unknown schema URLs fail closed.
        self.registry = Registry().with_resources(
            (s["$id"], Resource.from_contents(s)) for s in self.schemas.values()
        )
        self.books = {
            b["id"] for b in read_json(root / "data/knowledge/registries/books.json")
        }

    def schema(self, name: str, value):
        Draft202012Validator(self.schemas[name], registry=self.registry).validate(value)
        self.references(value)

    def registries(self, registries: dict):
        for name in ("books", "editions", "reference-systems"):
            ids = [r["id"] for r in registries[name]]
            if len(ids) != len(set(ids)):
                raise ValueError("Duplicate registry ID: " + name)
        systems = {s["id"] for s in registries["reference-systems"]}
        editions = {e["id"] for e in registries["editions"]}
        for edition in registries["editions"]:
            self.schema("edition", edition)
            if edition["reference_system_id"] not in systems:
                raise ValueError("Unknown edition reference system")
        aliases = {}
        for alias in registries["aliases"]:
            key = (alias["namespace"], alias["alias"])
            if alias["book_id"] not in self.books or key in aliases:
                raise ValueError("Unknown book or duplicate alias")
            aliases[key] = alias["book_id"]
        keys = set()
        for mapping in registries["reference-mappings"]["passages"]:
            key = (
                mapping["edition_id"],
                mapping["book_id"],
                mapping["chapter"],
                mapping["verse_label"],
            )
            if (
                key in keys
                or mapping["edition_id"] not in editions
                or mapping["book_id"] not in self.books
            ):
                raise ValueError("Invalid or duplicate passage mapping")
            keys.add(key)
            self.schema("reference", mapping["target"])
        for mapping in registries["reference-mappings"]["shaul_verified"]:
            self.schema("reference", mapping["reference"])

    def references(self, value):
        if isinstance(value, dict):
            if value.get("system_id") == "davar-v1":
                if value["book_id"] not in self.books:
                    raise ValueError("Unknown canonical book")
                if value.get("kind") == "range":
                    if (value["start"]["chapter"], value["start"]["verse"]) > (
                        value["end"]["chapter"],
                        value["end"]["verse"],
                    ):
                        raise ValueError("Descending reference range")
            for child in value.values():
                self.references(child)
        elif isinstance(value, list):
            for child in value:
                self.references(child)

    def records(self, records: dict, *, public=False):
        self.schema("records", records)
        by_id, kinds = {}, {}
        for collection, kind in COLLECTIONS.items():
            for record in records[collection]:
                if record["id"] in by_id:
                    raise ValueError("Duplicate record ID: " + record["id"])
                by_id[record["id"]] = record
                kinds[record["id"]] = (
                    record.get("kind", kind) if collection == "concepts" else kind
                )

        def require(id, kind):
            if id not in by_id or kinds[id] != kind:
                raise ValueError(f"Unresolved {kind}: {id}")
            return by_id[id]

        def target(t):
            if "id" in t:
                require(t["id"], t["kind"])

        for record in by_id.values():
            p = record.get("provenance")
            if p:
                source = require(p["source_id"], "source")
                if public and (
                    p["visibility"] != "public" or source["visibility"] != "public"
                ):
                    raise ValueError("Private provenance in public records")
            if (
                public
                and kinds[record["id"]] == "source"
                and record["visibility"] != "public"
            ):
                raise ValueError("Private source in public records")
        for concept in records["concepts"]:
            source = require(concept["provenance"]["source_id"], "source")
            if concept["owner"] != source["owner"]:
                raise ValueError(
                    "Concept owner differs from its provenance source owner"
                )
        for p in records["passages"]:
            require(p["edition_id"], "edition")
            if p["book_id"] not in self.books:
                raise ValueError("Unknown source book")
            if (p["mapping"]["status"] == "mapped") != bool(p["mapping"]["targets"]):
                raise ValueError("Inconsistent reference mapping")
            ts = sorted(
                (t for t in records["tokens"] if t["source_passage_id"] == p["id"]),
                key=lambda t: t["ordinal"],
            )
            if [t["ordinal"] for t in ts] != list(range(1, len(ts) + 1)):
                raise ValueError("Token ordinals must be consecutive and unique")
            if p["language"] == "mul" and (
                not ts or any("language" not in t for t in ts)
            ):
                raise ValueError(
                    "Mixed-language passages require explicit token languages"
                )
            identity = dict(
                edition_id=p["edition_id"],
                book_id=p["book_id"],
                native_reference=p["native_reference"],
                text=p["text"],
                surfaces=[t["text"] for t in ts],
                tokenization_policy=p["tokenization_policy"],
            )
            expected = digest(encoded(identity))
            if (
                expected != p["text_snapshot"]
                or p["id"]
                != f"passage:{p['edition_id']}:{p['book_id']}:{p['native_reference']['chapter']}:{expected}"
            ):
                raise ValueError("Passage snapshot/ID mismatch")
        for t in records["tokens"]:
            require(t["source_passage_id"], "passage")
            if t["id"] != f"token:{t['source_passage_id']}:{t['ordinal']}":
                raise ValueError("Token ID mismatch")
        for s in records["spans"]:
            require(s["source_passage_id"], "passage")
            ordinals = {
                t["ordinal"]
                for t in records["tokens"]
                if t["source_passage_id"] == s["source_passage_id"]
            }
            if (
                s["end_ordinal"] < s["start_ordinal"]
                or s["end_ordinal"] > len(ordinals)
                or not set(range(s["start_ordinal"], s["end_ordinal"] + 1)) <= ordinals
            ):
                raise ValueError("Invalid span endpoints")
            if (
                s["id"]
                != f"span:{s['source_passage_id']}:{s['start_ordinal']}-{s['end_ordinal']}"
            ):
                raise ValueError("Span ID mismatch")
        for e in records["evidence"]:
            for t in e["targets"]:
                target(t)
        for r in records["relations"]:
            target(r["subject"])
            target(r["object"])
            if r["predicate"] == "expresses_concept" and (
                r["subject"]["kind"] not in ("span", "expression")
                or r["object"]["kind"] != "concept"
            ):
                raise ValueError("Invalid expresses_concept subjects")
            if r["predicate"] == "contextually_related_to" and "scope" not in r:
                raise ValueError("Contextual relation requires scope")
            for eid in r["evidence_ids"]:
                require(eid, "evidence")

    def claim(self, claim: dict, records: dict):
        self.schema("claim", claim)
        self.records(records)
        known = {
            r["id"]: (r.get("kind") if c == "concepts" else k)
            for c, k in COLLECTIONS.items()
            for r in records[c]
        }
        for target in claim["targets"]:
            if "id" in target and known.get(target["id"]) != target["kind"]:
                raise ValueError("Unresolved claim target")
        if any(known.get(e) != "evidence" for e in claim["evidence_ids"]):
            raise ValueError("Unresolved claim evidence")
        if known.get(claim["provenance"]["source_id"]) != "source":
            raise ValueError("Unresolved claim provenance")

    def bundle(self, bundle: dict):
        self.schema("bundle", bundle)
        self.records(bundle["records"], public=True)
        for p in bundle["records"]["passages"]:
            if bundle["reference"] not in p["mapping"]["targets"]:
                raise ValueError("Bundle contains a passage outside its reference")
        coverage = bundle["coverage"]
        if len({c["edition_id"] for c in coverage}) != len(coverage):
            raise ValueError("Duplicate edition coverage")
        present = {p["edition_id"] for p in bundle["records"]["passages"]}
        if {c["edition_id"] for c in coverage if c["status"] == "present"} != present:
            raise ValueError("Coverage does not match passages")


def validate_locators(records: dict, source_payloads: dict):
    """Prove that normalized locators resolve in the exact pinned source bytes."""
    for collection in records.values():
        for record in collection:
            p = record.get("provenance")
            if not p:
                continue
            value = source_payloads[p["source_id"]]
            locator = p["locator"]
            if locator["kind"] == "markdown":
                if "## " + locator["heading"] not in value:
                    raise ValueError("Unresolved Markdown heading")
                continue
            for part in locator["pointer"].split("/")[1:]:
                part = part.replace("~1", "/").replace("~0", "~")
                value = value[int(part)] if isinstance(value, list) else value[part]
            if "ordinal" in record and value["text"] != record["text"]:
                raise ValueError("Token surface differs from provenance")


def validate_tree(path: Path, root: Path = ROOT):
    validator = Validator(root)
    manifest = read_json(path / "manifest.json")
    validator.schema("manifest", manifest)
    listed = [f["path"] for f in manifest["files"]]
    if len(listed) != len(set(listed)) or "manifest.json" in listed:
        raise ValueError("Duplicate/self-referential artifact manifest")
    actual = sorted(
        p.relative_to(path).as_posix() for p in path.rglob("*") if p.is_file()
    )
    if sorted(listed + ["manifest.json"]) != actual:
        raise ValueError("Artifact file set differs from manifest")
    from .core import contained

    for item in manifest["files"]:
        file = contained(path, item["path"])
        if file.is_symlink() or digest(file.read_bytes()) != item["sha256"]:
            raise ValueError("Artifact checksum mismatch")
        data = read_json(file)
        if item["path"] == "records/records.json":
            validator.records(data)
        elif item["path"].startswith("bundles/"):
            validator.bundle(data)
            if data["input_manifest_digest"] != manifest["input_manifest_digest"]:
                raise ValueError("Bundle input digest mismatch")
        else:
            raise ValueError("Unexpected artifact")
