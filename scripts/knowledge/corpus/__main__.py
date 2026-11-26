"""Run with python -m scripts.knowledge.corpus {snapshot,check,build,compare}."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from ..build import output_guard
from ..core import ROOT, SOURCES, cli_dest, contained, encoded, read_json, resolve_roots
from .engine import REPORTS, SNAPSHOTS, Snapshot, generate, newest_snapshot, pin


def git(cwd: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


def require_clean(root: Path, snap: Snapshot, external_roots: dict) -> str:
    for family in snap.included():
        include = family.include
        if include.origin == "davar":
            checkout, path = root, include.root
        else:
            checkout, path = external_roots[include.origin], include.root
            if git(checkout, "rev-parse", "HEAD") != include.revision:
                raise ValueError(
                    f"{include.origin} checkout must be at {include.revision}"
                )
        if git(checkout, "status", "--porcelain", "--untracked-files=all", "--", path):
            raise ValueError(f"Uncommitted source changes under {path}")
    return git(root, "rev-parse", "HEAD")


def committed(root: Path, name: str) -> dict[str, bytes]:
    directory = contained(root, (SNAPSHOTS / name).as_posix())
    paths = ["manifest.json", *(f"reports/{r}.json" for r in REPORTS)]
    return {p: (directory / p).read_bytes() for p in paths if (directory / p).exists()}


def regenerate(
    root: Path,
    snap: Snapshot,
    pins: list,
    external_roots: dict,
    sink=lambda path, data: None,
):
    manifest, reports = generate(root, snap, pins, external_roots, sink)
    files = {"manifest.json": encoded(manifest)}
    files.update({f"reports/{name}.json": encoded(reports[name]) for name in REPORTS})
    return files


def snapshot(root: Path, name: str, external_roots: dict):
    snap = Snapshot.load(root, name, external_roots)
    revision = require_clean(root, snap, external_roots)
    files = regenerate(
        root, snap, pin(root, snap, revision, external_roots), external_roots
    )
    existing = committed(root, name)
    if existing and existing != files:
        raise ValueError(
            f"Snapshot {name} already holds different bytes; create a new snapshot"
        )
    directory = root / SNAPSHOTS / name
    for path, data in files.items():
        target = directory / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(data)


def check(root: Path, name: str, external_roots: dict):
    snap = Snapshot.load(root, name, external_roots)
    expected = committed(root, name)
    pins = json.loads(expected["manifest.json"])["inputs"]
    actual = regenerate(root, snap, pins, external_roots)
    stale = sorted(
        p for p in actual.keys() | expected.keys() if actual.get(p) != expected.get(p)
    )
    if stale:
        before, after = (
            {f["path"]: f["sha256"] for f in json.loads(files["manifest.json"])["files"]}
            for files in (expected, actual)
        )
        changed = sorted(
            p for p in before.keys() | after.keys() if before.get(p) != after.get(p)
        )
        raise ValueError(f"Snapshot {name} is stale: {changed or stale}")


def build(root: Path, name: str, output: Path, external_roots: dict):
    output_guard(output, root)
    snap = Snapshot.load(root, name, external_roots)
    pins = read_json(root / SNAPSHOTS / name / "manifest.json")["inputs"]

    def write(path, data):
        target = contained(output, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as handle:
            handle.write(data)

    output.mkdir(parents=True, exist_ok=True)
    files = regenerate(root, snap, pins, external_roots, write)
    if files != committed(root, name):
        raise ValueError(f"Built corpus differs from committed snapshot {name}")


def compare(root: Path, old: str, new: str) -> dict:
    before, after = (
        read_json(root / SNAPSHOTS / n / "manifest.json") for n in (old, new)
    )

    def diff(key, rows):
        a = {r[key]: r["sha256"] for r in before[rows]}
        b = {r[key]: r["sha256"] for r in after[rows]}
        return dict(
            added=sorted(b.keys() - a.keys()),
            removed=sorted(a.keys() - b.keys()),
            changed=sorted(k for k in a.keys() & b.keys() if a[k] != b[k]),
        )

    counts = {}
    for name in (old, new):
        coverage = read_json(root / SNAPSHOTS / name / "reports/coverage.json")
        counts[name] = {
            f["id"]: (f["disposition"], f.get("normalized"), f.get("unresolved"))
            for f in coverage["families"]
        }
    families = {
        family: {old: counts[old].get(family), new: counts[new].get(family)}
        for family in sorted(counts[old].keys() | counts[new].keys())
        if counts[old].get(family) != counts[new].get(family)
    }
    return dict(
        inputs=diff("path", "inputs"),
        artifacts=diff("path", "files"),
        families=families,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["snapshot", "check", "build", "compare"])
    parser.add_argument("snapshot")
    parser.add_argument("other", nargs="?")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path)
    for row in SOURCES.values():
        parser.add_argument(row["cli_flag"], type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    external_roots = {
        kind: path.resolve()
        for kind, path in resolve_roots(
            {
                cli_dest(r["cli_flag"]): getattr(args, cli_dest(r["cli_flag"]))
                for r in SOURCES.values()
            }
        ).items()
    }
    if args.snapshot == "newest":
        args.snapshot = newest_snapshot(root)
    if args.command == "compare":
        if args.other is None:
            parser.error("compare needs two snapshot names")
        print(
            json.dumps(
                compare(root, args.snapshot, args.other), indent=2, sort_keys=True
            )
        )
        return
    if args.command == "build":
        if args.output is None:
            parser.error("build requires --output (new or empty temporary directory)")
        build(root, args.snapshot, args.output.absolute(), external_roots)
    else:
        {"snapshot": snapshot, "check": check}[args.command](
            root, args.snapshot, external_roots
        )
    print(f"knowledge corpus {args.command} {args.snapshot}: OK")


if __name__ == "__main__":
    main()
