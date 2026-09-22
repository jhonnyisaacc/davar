"""Opt-in regression harness. Legacy generation runs only in disposable copies."""

from __future__ import annotations

import argparse
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path

from .build import build
from .core import ROOT, SOURCES, cli_dest, digest, encoded, read_json

ALLOWED = (
    "contracts/biblical-knowledge/v1/",
    "data/knowledge/",
    "scripts/knowledge/",
    "tests/fixtures/knowledge/",
    "tests/test_knowledge_",
)
WORKFLOW = ".github/workflows/knowledge-foundation.yml"
SHAUL_REVISION = "8c94b0fe9eca817e22340430309801d0ef76125b"
SHAUL_ORIGIN = "https://github.com/jhonnyisaacc/shaul.git"
KNOWLEDGE_CODE = "scripts/knowledge/"


def run(args, cwd=ROOT, env=None):
    subprocess.run(args, cwd=cwd, env=env, check=True)


def fetch_shaul(destination: Path):
    run(["git", "init", "--quiet", str(destination)])
    run(["git", "remote", "add", "origin", SHAUL_ORIGIN], cwd=destination)
    run(["git", "fetch", "--depth", "1", "origin", SHAUL_REVISION], cwd=destination)
    run(["git", "checkout", "--quiet", "FETCH_HEAD"], cwd=destination)


def boundary(base: str, root=ROOT, shaul_root: Path | None = None):
    changes = subprocess.check_output(
        ["git", "diff", "--name-status", base, "--"], cwd=root, text=True
    )
    knowledge_edits = False
    for line in changes.splitlines():
        status, path = line.split("\t", 1)
        if path.startswith(KNOWLEDGE_CODE) and status != "A":
            knowledge_edits = True
            continue
        if status != "A" or not (path.startswith(ALLOWED) or path == WORKFLOW):
            raise ValueError("Non-additive or out-of-scope change: " + line)
    untracked = subprocess.check_output(
        ["git", "ls-files", "--others", "--exclude-standard"], cwd=root, text=True
    )
    for path in untracked.splitlines():
        if not (path.startswith(ALLOWED) or path == WORKFLOW):
            raise ValueError("Out-of-scope untracked file: " + path)
    for directory in ("shared", "web", "mobile", "scripts/generate-static-data"):
        for path in (root / directory).rglob("*"):
            if path.suffix in (".ts", ".tsx", ".js", ".py") and not any(
                x in path.parts for x in ("node_modules", "public", "dist")
            ):
                text = path.read_text(encoding="utf-8")
                if (
                    "scripts.knowledge" in text
                    or "biblical-knowledge" in text
                    or "scripts/knowledge" in text
                ):
                    raise ValueError(
                        "Legacy dependency on foundation: "
                        + str(path.relative_to(root))
                    )
    if knowledge_edits:
        if shaul_root is None:
            with tempfile.TemporaryDirectory(prefix="davar-shaul-pin-") as temp:
                checkout = Path(temp) / "shaul"
                fetch_shaul(checkout)
                shaul(checkout, root)
        else:
            shaul(shaul_root, root)
        print("Shaul output unchanged and legacy import isolation: OK")
    else:
        print("Additive file boundary and legacy import isolation: OK")


def tree(path: Path, *, legacy_clock=False):
    result = {}
    for file in sorted(path.rglob("*")):
        if not file.is_file():
            continue
        name = file.relative_to(path).as_posix()
        data = file.read_bytes()
        if legacy_clock and name == "manifest.json":
            manifest = read_json(file)
            # Exactly the two pre-existing clock-derived values are excluded.
            for key in ("version", "generated_at"):
                manifest.pop(key)
            data = encoded(manifest)
        result[name] = digest(data)
    return result


def archive(root: Path, revision: str, destination: Path):
    destination.mkdir()
    process = subprocess.Popen(
        ["git", "archive", "--format=tar", revision], cwd=root, stdout=subprocess.PIPE
    )
    try:
        with tarfile.open(fileobj=process.stdout, mode="r|") as tar:
            tar.extractall(destination, filter="data")
    finally:
        process.stdout.close()
    if process.wait() != 0:
        raise ValueError("git archive failed")


def legacy(base: str, root=ROOT):
    boundary(base, root)
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in {"SUPABASE_URL", "PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"}
    }
    with tempfile.TemporaryDirectory(prefix="davar-legacy-compat-") as temporary:
        work = Path(temporary).resolve()
        baseline_outputs = {}
        # Process sequentially: two full corpora and their generated trees need not coexist.
        for label, revision in (("base", base), ("candidate", "HEAD")):
            with tempfile.TemporaryDirectory(
                prefix=label + "-", dir=work
            ) as checkout_parent:
                checkout = Path(checkout_parent) / "checkout"
                archive(root, revision, checkout)
                for export in ("0", "1"):
                    if export == "1":
                        # Synthetic text only. No original TS2009 files or remote credentials.
                        path = checkout / "data/ts2009/genesis.json"
                        if path.exists():
                            raise ValueError(
                                "Unexpected TS2009 input in source archive"
                            )
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_bytes(
                            encoded(
                                {
                                    "chapters": [
                                        {
                                            "chapter": 1,
                                            "verses": [
                                                {
                                                    "verse": 1,
                                                    "text": "SYNTHETIC COMPATIBILITY FIXTURE",
                                                }
                                            ],
                                        }
                                    ]
                                }
                            )
                        )
                    run(
                        ["bun", "scripts/generate-static-data/index.ts"],
                        checkout,
                        {**env, "EXPORT_TS2009_STATIC": export},
                    )
                    actual = tree(checkout / "web/public/data", legacy_clock=True)
                    if label == "base":
                        baseline_outputs[export] = actual
                        continue
                    expected = baseline_outputs[export]
                    if expected != actual:
                        differences = sorted(
                            k
                            for k in expected.keys() | actual.keys()
                            if expected.get(k) != actual.get(k)
                        )
                        raise ValueError(
                            "Legacy generation changed: " + repr(differences[:20])
                        )
                    before = tree(checkout / "web/public/data")
                    build(work / ("knowledge-" + export), root)
                    if before != tree(checkout / "web/public/data"):
                        raise ValueError(
                            "Foundation generation changed legacy artifacts"
                        )
                    if (checkout / "web/public/data/bundles/ts2009.json").exists() != (
                        export == "1"
                    ):
                        raise ValueError("TS2009 export behavior changed")
                    print(
                        f"Legacy artifact parity and non-interference, EXPORT_TS2009_STATIC={export}: OK",
                        flush=True,
                    )
                    if export == "0":
                        for app, pattern in (
                            ("web", "src/app/services/*.test.*"),
                            ("mobile", "src/services/*.test.ts"),
                        ):
                            tests = [
                                str(p.relative_to(checkout / app))
                                for p in sorted((checkout / app).glob(pattern))
                            ]
                            run(["bun", "test", *tests], checkout / app, env)


def shaul(root: Path, davar=ROOT):
    revision = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True
    ).strip()
    if revision != SHAUL_REVISION:
        raise ValueError("Shaul regression checkout must be at the pinned revision")
    before = {
        p: tree(root / p)
        for p in ("content", "knowledge", "generated", "static/api/v1/verse-notes")
    }
    with tempfile.TemporaryDirectory(prefix="davar-shaul-compat-") as temp:
        build(Path(temp).resolve() / "output", davar, shaul_root=root)
    if before != {p: tree(root / p) for p in before}:
        raise ValueError("Shaul files changed during read-only adapter execution")
    print("Pinned Shaul source and artifact non-interference: OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["boundary", "legacy", "shaul"])
    parser.add_argument("--base", default="origin/main")
    for row in SOURCES.values():
        parser.add_argument(row["cli_flag"], type=Path)
    args = parser.parse_args()
    if args.command == "boundary":
        checkout = None
        for row in SOURCES.values():
            value = getattr(args, cli_dest(row["cli_flag"]))
            if value is not None:
                checkout = value.resolve()
        boundary(args.base, shaul_root=checkout)
    elif args.command == "legacy":
        legacy(args.base)
    elif args.command in SOURCES:
        row = SOURCES[args.command]
        checkout = getattr(args, cli_dest(row["cli_flag"]))
        if checkout is None:
            parser.error(f"{args.command} requires {row['cli_flag']}")
        shaul(checkout.resolve())


if __name__ == "__main__":
    main()
