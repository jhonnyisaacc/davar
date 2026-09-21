"""Independent, deterministic pilot build; no application or legacy build imports."""

from __future__ import annotations

from pathlib import Path
import tempfile
import json

from . import adapters
from .core import (
    COLLECTIONS,
    KNOWLEDGE,
    OUTPUT,
    ROOT,
    contained,
    digest,
    encoded,
    pinned_inputs,
    provenance,
    read_json,
    reference,
)
from .validate import Validator, validate_locators, validate_tree
from .profiles import load_profile, validate_selections


def source_record(item: dict, lexical_inputs=()):
    kind = (
        "published_note"
        if item["path"].endswith(".md")
        else "knowledge_record"
        if item["owner"] == "shaul"
        else "lexicon"
        if item["id"] in lexical_inputs
        else "dataset"
    )
    return dict(
        id="source:" + item["id"],
        owner=item["owner"],
        kind=item.get("kind", kind),
        repository=item["repository"],
        revision=item["revision"],
        path=item["path"],
        sha256=item["sha256"],
        visibility="public",
    )


def project(records: dict, query: dict, inputs_digest: str, coverage=None):
    sources = {s["id"]: s for s in records["sources"]}

    def public(record):
        p = record.get("provenance")
        return not p or (
            p["visibility"] == "public"
            and sources[p["source_id"]]["visibility"] == "public"
        )

    result = {key: [] for key in COLLECTIONS}
    result["passages"] = [
        p for p in records["passages"] if query in p["mapping"]["targets"] and public(p)
    ]
    pids = {p["id"] for p in result["passages"]}
    result["tokens"] = [
        t for t in records["tokens"] if t["source_passage_id"] in pids and public(t)
    ]
    result["spans"] = [
        s for s in records["spans"] if s["source_passage_id"] in pids and public(s)
    ]
    sids = {s["id"] for s in result["spans"]}
    tids = {t["id"] for t in result["tokens"]}
    lexical = {
        (r["namespace"], r["code"]) for t in result["tokens"] for r in t["lexical_refs"]
    }

    def relevant(t):
        return (
            (t["kind"] == "reference" and t["reference"] == query)
            or (t["kind"] == "passage" and t["id"] in pids)
            or (t["kind"] == "token" and t["id"] in tids)
            or (t["kind"] == "span" and t["id"] in sids)
            or (
                t["kind"] == "external_lexical"
                and (t["reference"]["namespace"], t["reference"]["code"]) in lexical
            )
        )

    result["evidence"] = [
        e
        for e in records["evidence"]
        if public(e) and any(relevant(t) for t in e["targets"])
    ]
    eids = {e["id"] for e in result["evidence"]}
    public_concepts = {c["id"] for c in records["concepts"] if public(c)}

    def endpoint_available(target):
        if target["kind"] in ("concept", "expression"):
            return target["id"] in public_concepts
        if target["kind"] == "evidence":
            return target["id"] in eids
        return relevant(target)

    result["relations"] = [
        r
        for r in records["relations"]
        if public(r)
        and set(r["evidence_ids"]) <= eids
        and all(endpoint_available(t) for t in (r["subject"], r["object"]))
        and (
            r.get("scope") == query
            or (
                "scope" not in r
                and (
                    relevant(r["subject"])
                    or relevant(r["object"])
                    or bool(r["evidence_ids"])
                )
            )
        )
    ]
    cids = {
        r[endpoint].get("id")
        for r in result["relations"]
        for endpoint in ("subject", "object")
    }
    result["concepts"] = [
        c for c in records["concepts"] if c["id"] in cids and public(c)
    ]
    source_ids = {
        r["provenance"]["source_id"]
        for rs in result.values()
        for r in rs
        if "provenance" in r
    }
    result["sources"] = [s for s in records["sources"] if s["id"] in source_ids]
    editions = {p["edition_id"] for p in result["passages"]}
    result["editions"] = [e for e in records["editions"] if e["id"] in editions]
    for rs in result.values():
        rs.sort(key=lambda r: r["id"])
    if coverage is None:
        coverage = [
            dict(
                edition_id=e["id"],
                status="present" if e["id"] in editions else "not_requested",
                reason="Selected passage" if e["id"] in editions else "Not requested",
            )
            for e in records["editions"]
        ]
    if {c["edition_id"] for c in coverage if c["status"] == "present"} != editions:
        raise ValueError("Requested coverage differs from normalized passages")
    diagnostics = sorted(
        {
            f"{r['raw']}: {r['reason']}"
            for e in result["evidence"]
            for r in e["content"].get("references", [])
            if isinstance(r, dict) and r.get("status") == "unresolved"
        }
    )
    return dict(
        contract_version="1.0.0",
        reference=query,
        input_manifest_digest=inputs_digest,
        records=result,
        coverage=sorted(coverage, key=lambda item: item["edition_id"]),
        diagnostics=diagnostics,
    )


def artifacts(root: Path = ROOT, shaul_root: Path | None = None, profile=None):
    profile = load_profile(root, profile)
    manifest, blobs = pinned_inputs(root, shaul_root, profile["input_manifest"])
    registries = {
        p.stem: read_json(p)
        for p in sorted((root / KNOWLEDGE / "registries").glob("*.json"))
    }
    registries["reference-mappings"] = read_json(
        contained(root, profile["reference_mappings"])
    )
    authored = {
        key: read_json(contained(root, path))
        for key, path in profile["authored"].items()
    }
    schema_hashes = {
        p.name: digest(p.read_bytes())
        for p in sorted((root / "contracts/biblical-knowledge/v1").glob("*.json"))
    }
    validator = Validator(root)
    validator.registries(registries)
    validator.schema("input-manifest", manifest)
    validate_selections(profile, manifest, registries)
    input_digest = digest(
        encoded(
            dict(
                manifest=manifest,
                profile=profile,
                registries=registries,
                authored=authored,
                schemas=schema_hashes,
            )
        )
    )
    records = {k: [] for k in COLLECTIONS}
    records["editions"] = registries["editions"]
    lexical_inputs = {s["input_id"] for s in profile["lexical"]}
    records["sources"] = [source_record(i, lexical_inputs) for i in manifest["inputs"]]
    records["passages"], records["tokens"], records["evidence"] = adapters.scripture(
        blobs, registries["reference-mappings"], profile["scripture"]
    )
    records["evidence"].extend(adapters.lexical(blobs, profile["lexical"]))
    records["concepts"], evidence, records["relations"] = adapters.shaul(
        blobs, registries["aliases"], registries["reference-mappings"], profile["shaul"]
    )
    records["evidence"].extend(evidence)
    for name, selected_path in profile["authored"].items():
        path = Path(selected_path)
        checksum = digest((root / path).read_bytes())
        records["sources"].append(
            dict(
                id="source:authored-" + name,
                owner="davar",
                kind="authored_mapping",
                repository="https://github.com/jhonnyisaacc/davar",
                revision="sha256:" + checksum,
                path=path.as_posix(),
                sha256=checksum,
                visibility="public",
            )
        )
    spans = {}
    for i, spec in enumerate(authored.get("spans", [])):
        if spec["key"] in spans:
            raise ValueError("Duplicate authored span key: " + spec["key"])
        matches = [
            p
            for p in records["passages"]
            if (
                p["edition_id"],
                p["book_id"],
                p["native_reference"]["chapter"],
                p["native_reference"]["verse_label"],
            )
            == (
                spec["edition_id"],
                spec["book_id"],
                spec["chapter"],
                spec["verse_label"],
            )
        ]
        if len(matches) != 1:
            raise ValueError("Authored span passage is missing or ambiguous")
        passage = matches[0]
        selected = [
            t["text"]
            for t in records["tokens"]
            if t["source_passage_id"] == passage["id"]
            and spec["start_ordinal"] <= t["ordinal"] <= spec["end_ordinal"]
        ]
        if selected != spec["expected_texts"]:
            raise ValueError("Authored span text precondition failed: " + spec["key"])
        span = dict(
            id=f"span:{passage['id']}:{spec['start_ordinal']}-{spec['end_ordinal']}",
            source_passage_id=passage["id"],
            start_ordinal=spec["start_ordinal"],
            end_ordinal=spec["end_ordinal"],
            provenance=provenance("source:authored-spans", f"/{i}", authored=True),
        )
        records["spans"].append(span)
        spans[spec["key"]] = (span, passage)
    for i, spec in enumerate(authored.get("relations", [])):
        span, passage = spans[spec["span_key"]]
        if len(passage["mapping"]["targets"]) != 1:
            raise ValueError("Authored relation needs one verified canonical scope")
        if not any(c["id"] == spec["expression_id"] for c in records["concepts"]):
            raise ValueError("Unknown expression in authored mapping")
        records["relations"].append(
            dict(
                id=spec["id"],
                owner="davar",
                subject={"kind": "span", "id": span["id"]},
                predicate="expresses_concept",
                object={"kind": "concept", "id": spec["concept_id"]},
                scope=passage["mapping"]["targets"][0],
                evidence_ids=[spec["evidence_id"]],
                provenance=provenance(
                    "source:authored-relations", f"/{i}", authored=True
                ),
            )
        )
    for values in records.values():
        values.sort(key=lambda r: r["id"])
    validator.records(records)
    payloads = {}
    for item in manifest["inputs"]:
        data = blobs[item["id"]]
        payloads["source:" + item["id"]] = (
            data.decode()
            if item["path"].endswith(".md")
            else adapters.load_yaml(data)
            if item["path"].endswith((".yml", ".yaml"))
            else json.loads(data)
        )
    payloads.update({"source:authored-" + k: v for k, v in authored.items()})
    validate_locators(records, payloads)
    files = {"records/records.json": encoded(records)}
    for book, chapter, verse in manifest["pilots"]:
        query = reference(book, chapter, verse)
        coverage = [
            {k: v for k, v in entry.items() if k != "reference"}
            for entry in profile["coverage"]
            if entry["reference"] == query
        ]
        bundle = project(records, query, input_digest, coverage)
        validator.bundle(bundle)
        files[f"bundles/{book}/{chapter}/{verse}.json"] = encoded(bundle)
    artifact_manifest = dict(
        contract_version="1.0.0",
        generator_version="1.0.0",
        input_manifest_digest=input_digest,
        inputs=manifest["inputs"],
        files=[dict(path=p, sha256=digest(b)) for p, b in sorted(files.items())],
    )
    validator.schema("manifest", artifact_manifest)
    files["manifest.json"] = encoded(artifact_manifest)
    return files


def output_guard(output: Path, root: Path):
    if output.is_symlink() or output.absolute() != output.resolve():
        raise ValueError("Output must be a canonical path without symlinks")
    output, root = output.resolve(), root.resolve()
    allowed = root / OUTPUT
    if not output.is_relative_to(root):
        temp_roots = (Path(tempfile.gettempdir()).resolve(), Path("/tmp").resolve())
        if not any(output.is_relative_to(t) and output != t for t in temp_roots):
            raise ValueError("External output must be inside a temporary directory")
        if any((p / ".git").exists() for p in (output, *output.parents)):
            raise ValueError("External output overlaps another checkout")
    if output.is_relative_to(root) and output != allowed:
        raise ValueError(
            "Only the dedicated pilot output is writable inside the repository"
        )
    if root.is_relative_to(output):
        raise ValueError("Output overlaps repository root")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        # Updates belong in an explicitly reviewed regeneration step, not a recursive cleanup.
        raise ValueError("Output must be a new or empty directory")


def build(
    output: Path, root: Path = ROOT, shaul_root: Path | None = None, profile=None
):
    output_guard(output, root)
    if shaul_root and (
        output.resolve().is_relative_to(shaul_root.resolve())
        or shaul_root.resolve().is_relative_to(output.resolve())
    ):
        raise ValueError("Output overlaps Shaul inputs")
    files = artifacts(root, shaul_root, profile)
    output.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        path = contained(output, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as handle:
            handle.write(data)
    validate_tree(output, root)
