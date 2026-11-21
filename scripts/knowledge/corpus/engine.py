from __future__ import annotations

import fnmatch
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from ..build import source_record
from ..core import (
    COLLECTIONS,
    KNOWLEDGE,
    SOURCES,
    contained,
    digest,
    encoded,
    read_json,
)
from ..validate import SCHEMAS, Validator, validate_locators
from .families import (
    ADAPTERS,
    Context,
    Input,
    Normalized,
    Reason,
    Unit,
    Unresolved,
    UnresolvedRef,
    walk,
    unit_pointer,
    chapter_of,
)

NORMALIZER = "corpus-1"
SNAPSHOTS = KNOWLEDGE / "corpus"
DAVAR_REPOSITORY = "https://github.com/jhonnyisaacc/davar"
DISPOSITIONS = ("included", "unavailable", "restricted", "deferred")
REPORTS = ("coverage", "unresolved", "validation")
CHECKS = (
    "pins_match_bytes_and_discovery",
    "inventory_dispositions_and_evidence",
    "record_schema_and_domain_integrity_per_shard",
    "provenance_locators_resolve_in_pinned_bytes",
    "identity_unique_across_shards",
    "passage_language_matches_edition",
    "withheld_token_fields_absent",
    "every_source_record_normalized_or_unresolved",
)


class PinDrift(ValueError):
    pass


@dataclass(frozen=True)
class Include:
    adapter: str
    origin: str
    root: str
    patterns: tuple[str, ...]
    exclude: tuple[str, ...] = ()
    edition_id: str | None = None
    id_namespace: str | None = None
    repository: str | None = None
    revision: str | None = None


@dataclass(frozen=True)
class Family:
    id: str
    disposition: str
    reason: str
    evidence: tuple[str, ...]
    paths: tuple[str, ...]
    include: Include | None


@dataclass(frozen=True)
class Snapshot:
    name: str
    inventory: dict
    families: tuple[Family, ...]
    editions: list

    @classmethod
    def load(cls, root: Path, name: str) -> "Snapshot":
        directory = contained(root, (SNAPSHOTS / name).as_posix())
        inventory = read_json(directory / "inventory.json")
        editions = read_json(directory / "editions.json")
        if inventory.get("snapshot") != name:
            raise ValueError("Inventory snapshot name differs from its directory")
        families = tuple(parse_family(root, row) for row in inventory["families"])
        ids = [f.id for f in families]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate source family")
        validator = Validator(root)
        registered = {
            e["id"] for e in read_json(root / KNOWLEDGE / "registries/editions.json")
        }
        for edition in editions:
            validator.schema("edition", edition)
            if edition["id"] in registered:
                raise ValueError(
                    "Corpus edition duplicates a registered edition: " + edition["id"]
                )
        known = registered | {e["id"] for e in editions}
        for family in families:
            if family.include and family.include.edition_id not in (None, *known):
                raise ValueError("Unknown edition for family " + family.id)
        require_complete(root, families, inventory.get("not_sources", []))
        return cls(name, inventory, families, editions)

    def included(self) -> tuple[Family, ...]:
        return tuple(f for f in self.families if f.include is not None)


def parse_family(root: Path, row: dict) -> Family:
    if row["disposition"] not in DISPOSITIONS:
        raise ValueError(f"Unknown disposition for {row['id']}: {row['disposition']}")
    if not row.get("reason") or not row.get("evidence"):
        raise ValueError("Every family needs a reason and evidence: " + row["id"])
    for item in row["evidence"]:
        require_evidence(root, item)
    include = row.get("include")
    if (include is not None) != (row["disposition"] == "included"):
        raise ValueError("Only included families carry an include rule: " + row["id"])
    if include is not None:
        include = Include(
            **{
                **include,
                "patterns": tuple(include["patterns"]),
                "exclude": tuple(include.get("exclude", ())),
            }
        )
        if include.adapter not in ADAPTERS:
            raise ValueError("Unknown adapter: " + include.adapter)
        external = SOURCES.get(include.origin)
        if include.origin != "davar" and (
            external is None
            or not (include.root + "/").startswith(external["path_prefixes"])
            or not include.repository
            or not include.revision
        ):
            raise ValueError(
                "External families need a public root, repository and revision"
            )
    return Family(
        row["id"],
        row["disposition"],
        row["reason"],
        tuple(row["evidence"]),
        tuple(row.get("paths", ())),
        include,
    )


def require_evidence(root: Path, item: str):
    path, _, lines = item.partition(":")
    file = contained(root, path)
    if not file.exists():
        raise ValueError("Missing evidence path: " + item)
    if lines:
        last = int(lines.split("-")[-1])
        if not file.is_file() or last > len(file.read_bytes().splitlines()):
            raise ValueError("Evidence line outside file: " + item)


def require_complete(root: Path, families, not_sources: list):
    covered = [n["path"] for n in not_sources]
    for family in families:
        covered += list(family.paths)
        if family.include and family.include.origin == "davar":
            covered.append(family.include.root)
    for child in sorted(
        p for p in (root / "data").iterdir() if not p.name.startswith(".")
    ):
        name = child.relative_to(root).as_posix()
        if not any(name == c or c.startswith(name + "/") for c in covered):
            raise ValueError("Source directory without a disposition: " + name)


def base_directory(root: Path, include: Include, external_roots: dict) -> Path:
    if include.origin == "davar":
        return contained(root, include.root)
    external = external_roots.get(include.origin)
    if external is None:
        raise ValueError(f"--{include.origin}-root is required for {include.root}")
    return contained(external, include.root)


def discover(base: Path, include: Include) -> list[str]:
    found = {
        p.relative_to(base).as_posix()
        for pattern in include.patterns
        for p in base.glob(pattern)
        if p.is_file()
    }
    return sorted(
        r for r in found if not any(fnmatch.fnmatch(r, x) for x in include.exclude)
    )


def pin(root: Path, snap: Snapshot, revision: str, external_roots: dict) -> list[dict]:
    pins = []
    for family in snap.included():
        include = family.include
        base = base_directory(root, include, external_roots)
        for relpath in discover(base, include):
            pins.append(
                dict(
                    id=f"{family.id}/{relpath}",
                    owner=include.origin,
                    kind=ADAPTERS[include.adapter].source_kind,
                    repository=include.repository or DAVAR_REPOSITORY,
                    revision=include.revision or revision,
                    path=f"{include.root}/{relpath}",
                    sha256=digest((base / relpath).read_bytes()),
                )
            )
    return pins


def load_inputs(
    root: Path, snap: Snapshot, pins: list[dict], external_roots: dict
) -> list[tuple[Family, Input]]:
    by_family = defaultdict(dict)
    for item in pins:
        family_id, relpath = item["id"].split("/", 1)
        by_family[family_id][relpath] = item
    inputs = []
    for family in snap.included():
        base = base_directory(root, family.include, external_roots)
        pinned = by_family.pop(family.id, {})
        found = discover(base, family.include)
        if found != sorted(pinned):
            extra = sorted(set(found) - set(pinned))
            missing = sorted(set(pinned) - set(found))
            raise PinDrift(f"{family.id}: unpinned {extra[:5]} missing {missing[:5]}")
        for relpath in found:
            data = (base / relpath).read_bytes()
            if digest(data) != pinned[relpath]["sha256"]:
                raise PinDrift("Pinned input drift: " + pinned[relpath]["path"])
            inputs.append((family, Input(family.id, relpath, pinned[relpath], data)))
    if by_family:
        raise PinDrift(
            "Pins for families that are not included: " + ", ".join(sorted(by_family))
        )
    return inputs


@dataclass
class Tally:
    families: dict
    editions: dict
    units: list
    references: list
    records: Counter
    shards: int = 0


class Checks:
    def __init__(self, root: Path, editions: dict):
        self.validator = Validator(root)
        self.editions = editions
        self.seen: set[str] = set()

    def shard(self, records: dict, payloads: dict, bare_sources: set, normalized: dict):
        self.validator.records(records, public=True)
        validate_locators(records, payloads)
        for collection in ("passages", "spans", "evidence", "concepts", "relations"):
            for record in records[collection]:
                if record["id"] in self.seen:
                    raise ValueError("Identity repeated across shards: " + record["id"])
                self.seen.add(record["id"])
        for passage in records["passages"]:
            language = self.editions[passage["edition_id"]]["language"]
            if language != "mul" and passage["language"] != language:
                raise ValueError(
                    "Passage language differs from its edition: " + passage["id"]
                )
        for token in records["tokens"]:
            if token["provenance"]["source_id"] in bare_sources and (
                token["lexical_refs"] or token["annotations"]
            ):
                raise ValueError("Withheld token fields present: " + token["id"])
        derived = {
            (
                r["provenance"]["source_id"],
                unit_pointer(
                    r["provenance"]["locator"]["pointer"],
                    normalized["depth"][r["provenance"]["source_id"]],
                ),
            )
            for collection in COLLECTIONS
            for r in records[collection]
            if "provenance" in r
        }
        if derived != normalized["keys"]:
            raise ValueError("Normalized records differ from the accounting ledger")


def close_references(outcomes: dict) -> None:
    present = {
        r["id"]
        for outcome in outcomes.values()
        if isinstance(outcome, Normalized)
        for rows in outcome.records.values()
        for r in rows
    }
    for key, outcome in list(outcomes.items()):
        if not isinstance(outcome, Normalized):
            continue
        for relation in outcome.records.get("relations", []):
            if not {relation["subject"]["id"], relation["object"]["id"]} <= present:
                outcomes[key] = Unresolved(Reason.DANGLING_ENDPOINT)
        for evidence in outcome.records.get("evidence", []):
            kept = [
                t for t in evidence["targets"] if "id" not in t or t["id"] in present
            ]
            outcome.references += [
                UnresolvedRef(t["id"], Reason.DANGLING_TARGET)
                for t in evidence["targets"]
                if t not in kept
            ]
            evidence["targets"] = kept


def generate(
    root: Path,
    snap: Snapshot,
    pins: list[dict],
    external_roots: dict,
    sink: Callable[[str, bytes], None],
):
    registries = {
        p.stem: read_json(p)
        for p in sorted((root / KNOWLEDGE / "registries").glob("*.json"))
    }
    editions = {e["id"]: e for e in registries["editions"] + snap.editions}
    schemas = {
        p.name: digest(p.read_bytes()) for p in sorted((root / SCHEMAS).glob("*.json"))
    }
    input_digest = digest(
        encoded(
            dict(
                normalizer=NORMALIZER,
                inventory=snap.inventory,
                editions=snap.editions,
                inputs=pins,
                registries=registries,
                schemas=schemas,
            )
        )
    )
    inputs = load_inputs(root, snap, pins, external_roots)
    shards = defaultdict(list)
    for family, item in inputs:
        adapter = ADAPTERS[family.include.adapter]
        shards[adapter.shard.format(family=family.id, relpath=item.relpath)].append(
            (family, item)
        )
    checks = Checks(root, editions)
    tally = Tally(
        {f.id: Counter() for f in snap.included()},
        defaultdict(lambda: defaultdict(Counter)),
        [],
        [],
        Counter(),
    )
    files = []
    for path in sorted(shards):
        records = shard_records(shards[path], registries, editions, checks, tally)
        data = encoded(records)
        sink(path, data)
        files.append(dict(path=path, sha256=digest(data)))
        tally.shards += 1
    reports = dict(
        coverage=coverage_report(snap, tally, registries["books"], input_digest),
        unresolved=unresolved_report(snap, tally),
        validation=dict(
            snapshot=snap.name,
            input_manifest_digest=input_digest,
            shards=tally.shards,
            records=dict(sorted(tally.records.items())),
            checks=list(CHECKS),
            status="passed",
        ),
    )
    for name in REPORTS:
        data = encoded(reports[name])
        sink(f"reports/{name}.json", data)
        files.append(dict(path=f"reports/{name}.json", sha256=digest(data)))
    manifest = dict(
        contract_version="1.0.0",
        generator_version="1.0.0",
        input_manifest_digest=input_digest,
        inputs=pins,
        files=sorted(files, key=lambda f: f["path"]),
    )
    checks.validator.schema("manifest", manifest)
    sink("manifest.json", encoded(manifest))
    return manifest, reports


def shard_records(members, registries, editions, checks: Checks, tally: Tally) -> dict:
    outcomes, payloads, depth, bare, families = {}, {}, {}, set(), {}
    for family, item in members:
        adapter = ADAPTERS[family.include.adapter]
        parsed = adapter.parse(item.data)
        payloads[item.source_id] = (
            parsed.decode("utf-8") if isinstance(parsed, bytes) else parsed
        )
        depth[item.source_id] = adapter.depth
        if adapter.bare_tokens:
            bare.add(item.source_id)
        ctx = Context(
            family.include.edition_id,
            family.include.id_namespace,
            adapter.book(item.relpath, registries["books"]),
            chapter_of(item.relpath),
            registries["reference-mappings"],
            registries["aliases"],
        )
        units = list(walk(parsed, adapter.pattern))
        if not units:
            raise ValueError("Input has no source records: " + item.id)
        for pointer, value, ancestors in units:
            key = (item.source_id, pointer)
            if key in outcomes:
                raise ValueError("Duplicate source record: " + repr(key))
            outcomes[key] = adapter.normalize(
                Unit(item, pointer, value, ancestors), ctx
            )
            families[key] = family.id
        tally.families[family.id]["inputs"] += 1
    close_references(outcomes)
    records = {k: [] for k in COLLECTIONS}
    for key, outcome in outcomes.items():
        counts = tally.families[families[key]]
        counts["units"] += 1
        if isinstance(outcome, Unresolved):
            counts["unresolved"] += 1
            tally.units.append(
                dict(source_id=key[0], pointer=key[1], reason=str(outcome.reason))
            )
            continue
        counts["normalized"] += 1
        for collection, rows in outcome.records.items():
            records[collection].extend(rows)
            counts[collection] += len(rows)
        tally.references += [
            dict(source_id=key[0], raw=r.raw, reason=str(r.reason))
            for r in outcome.references
        ]
    used = {p["edition_id"] for p in records["passages"]}
    records["editions"] = [editions[e] for e in sorted(used)]
    records["sources"] = [source_record(item.pin) for _, item in members]
    for rows in records.values():
        rows.sort(key=lambda r: r["id"])
    normalized = {
        "depth": depth,
        "keys": {k for k, o in outcomes.items() if isinstance(o, Normalized)},
    }
    checks.shard(records, payloads, bare, normalized)
    for passage in records["passages"]:
        book = tally.editions[passage["edition_id"]][passage["book_id"]]
        book["passages"] += 1
        book["chapter:" + str(passage["native_reference"]["chapter"])] = 1
        book["mapped" if passage["mapping"]["status"] == "mapped" else "unmapped"] += 1
        book["language:" + passage["language"]] += 1
    for collection, rows in records.items():
        tally.records[collection] += len(rows)
    return records


def coverage_report(
    snap: Snapshot, tally: Tally, books: list, input_digest: str
) -> dict:
    order = {b["id"]: b for b in books}
    families = []
    for family in snap.families:
        row = dict(
            id=family.id,
            disposition=family.disposition,
            reason=family.reason,
            evidence=list(family.evidence),
        )
        if family.include:
            counts = tally.families[family.id]
            row.update(
                inputs=counts["inputs"],
                units=counts["units"],
                normalized=counts["normalized"],
                unresolved=counts["unresolved"],
                records={c: counts[c] for c in COLLECTIONS if counts[c]},
            )
        families.append(row)
    editions = []
    for edition_id, by_book in sorted(tally.editions.items()):
        sections = {order[b]["section"] for b in by_book}
        rows = []
        for book_id in sorted(by_book, key=lambda b: order[b]["order"]):
            counts = by_book[book_id]
            present = sorted(
                int(k.split(":")[1]) for k in counts if k.startswith("chapter:")
            )
            expected = order[book_id]["chapters"]
            rows.append(
                dict(
                    book_id=book_id,
                    chapters_expected=expected,
                    chapters_present=len(present),
                    chapters_missing=[
                        c for c in range(1, expected + 1) if c not in present
                    ],
                    chapters_outside_registry=[c for c in present if c > expected],
                    passages=counts["passages"],
                    mapped=counts["mapped"],
                    unmapped=counts["unmapped"],
                    languages={
                        k.split(":")[1]: v
                        for k, v in sorted(counts.items())
                        if k.startswith("language:")
                    },
                )
            )
        missing = [
            b["id"]
            for b in books
            if b["section"] in sections and b["id"] not in by_book
        ]
        editions.append(dict(edition_id=edition_id, books_missing=missing, books=rows))
    return dict(
        snapshot=snap.name,
        input_manifest_digest=input_digest,
        families=families,
        editions=editions,
    )


def unresolved_report(snap: Snapshot, tally: Tally) -> dict:
    units = sorted(tally.units, key=lambda u: (u["source_id"], u["pointer"]))
    grouped = defaultdict(list)
    for ref in tally.references:
        grouped[ref["source_id"]].append([ref["raw"], ref["reason"]])
    references = [
        dict(source_id=s, unresolved=sorted(grouped[s])) for s in sorted(grouped)
    ]
    mappings = [
        dict(edition_id=edition_id, book_id=book_id, unmapped=counts["unmapped"])
        for edition_id, by_book in sorted(tally.editions.items())
        for book_id, counts in sorted(by_book.items())
        if counts["unmapped"]
    ]
    return dict(
        snapshot=snap.name,
        units_by_reason=dict(sorted(Counter(u["reason"] for u in units).items())),
        references_by_reason=dict(
            sorted(Counter(r["reason"] for r in tally.references).items())
        ),
        units=units,
        references=references,
        passage_mappings=mappings,
    )
