"""Opt-in regression harness. Legacy generation runs only in disposable copies."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path

import yaml

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


def publication_compatible(path: str, before: bytes, after: bytes) -> bool:
    """Permit only the optional publication extension and metadata-only rehashes."""
    if path == "contracts/biblical-knowledge/v1/README.md":
        return after.startswith(before)
    schema = "contracts/biblical-knowledge/v1/manifest.schema.json"
    pilot = "data/knowledge/generated/pilot-v1/"
    if path != schema and not (path.startswith(pilot + "bundles/") or path == pilot + "manifest.json"):
        return False
    try:
        old, new = json.loads(before), json.loads(after)
        if path == schema:
            extension = new.get("properties", {}).pop("artifacts", None)
            expected = {"type": "array", "items": {"$ref": "https://davar.bible/contracts/biblical-knowledge/v1/artifact.schema.json"}}
            return extension == expected and new == old
        for payload in (old, new):
            payload.pop("input_manifest_digest", None)
            if path == pilot + "manifest.json":
                for entry in payload.get("files", []):
                    entry.pop("sha256", None)
        return old == new
    except (ValueError, TypeError, AttributeError):
        return False


def workflow_change_additive(before: bytes, after: bytes) -> bool:
    """Allow workflow edits that only widen CI coverage.

    The knowledge-foundation workflow guards the additive boundary, so its own
    edits must not narrow it: trigger paths may only grow, and existing check
    commands may only gain arguments (for example, extra test files). Anything
    else (removed paths, dropped commands, toolchain changes) fails closed.
    """
    # NOTE: YAML 1.1 parses the `on:` trigger key as boolean True. Normalize it
    # so the coverage comparison below sees the real trigger config.
    def load(payload: bytes):
        try:
            doc = yaml.safe_load(payload)
        except Exception:
            return None
        if not isinstance(doc, dict):
            return None
        if True in doc and "on" not in doc:
            doc["on"] = doc.pop(True)
        return doc

    old, new = load(before), load(after)
    if old is None or new is None:
        return False
    old_on, new_on = old.get("on", {}) or {}, new.get("on", {}) or {}
    for trigger in ("pull_request", "push"):
        old_trigger = old_on.get(trigger, {}) or {}
        new_trigger = new_on.get(trigger, {}) or {}
        if set(old_trigger.get("paths", []) or []) - set(
            new_trigger.get("paths", []) or []
        ):
            return False
        if {k: v for k, v in old_trigger.items() if k != "paths"} != {
            k: v for k, v in new_trigger.items() if k != "paths"
        }:
            return False
    if {k: v for k, v in old_on.items() if k not in ("pull_request", "push")} != {
        k: v for k, v in new_on.items() if k not in ("pull_request", "push")
    }:
        return False

    def step_covers(old_step, new_step) -> bool:
        if not isinstance(old_step, dict) or not isinstance(new_step, dict):
            return old_step == new_step
        if {k: v for k, v in old_step.items() if k != "run"} != {
            k: v for k, v in new_step.items() if k != "run"
        }:
            return False
        if "run" not in old_step:
            return "run" not in new_step
        return "run" in new_step and set(str(old_step["run"]).split()) <= set(
            str(new_step["run"]).split()
        )

    def steps_compatible(old_steps, new_steps) -> bool:
        # Old steps must survive in order; added steps are widening, so allowed.
        pos = 0
        for old_step in old_steps:
            while pos < len(new_steps) and not step_covers(
                old_step, new_steps[pos]
            ):
                pos += 1
            if pos == len(new_steps):
                return False
            pos += 1
        return True

    old_jobs, new_jobs = old.get("jobs", {}) or {}, new.get("jobs", {}) or {}
    if set(old_jobs) - set(new_jobs):
        return False
    for name, old_job in old_jobs.items():
        new_job = new_jobs[name]
        if {k: v for k, v in old_job.items() if k != "steps"} != {
            k: v for k, v in new_job.items() if k != "steps"
        }:
            return False
        if not steps_compatible(
            old_job.get("steps", []) or [], new_job.get("steps", []) or []
        ):
            return False

    rest = {
        key for key in list(old) + list(new) if key not in ("on", "jobs")
    }
    return all(old.get(key) == new.get(key) for key in rest) and set(
        k for k in old if k not in ("on", "jobs")
    ) == set(k for k in new if k not in ("on", "jobs"))


def boundary(base: str, root=ROOT, shaul_root: Path | None = None):
    changes = subprocess.check_output(
        ["git", "diff", "--name-status", base, "--"], cwd=root, text=True
    )
    knowledge_edits = False
    for line in changes.splitlines():
        status, path = line.split("\t", 1)
        if not (path.startswith(ALLOWED) or path == WORKFLOW):
            continue
        if path.startswith(KNOWLEDGE_CODE) and status != "A":
            knowledge_edits = True
            continue
        if status == "M":
            before = subprocess.check_output(["git", "show", f"{base}:{path}"], cwd=root)
            after = (root / path).read_bytes()
            if path == WORKFLOW and workflow_change_additive(before, after):
                continue
            if publication_compatible(path, before, after):
                continue
        if status != "A":
            raise ValueError("Non-additive or out-of-scope change: " + line)
    untracked = subprocess.check_output(
        ["git", "ls-files", "--others", "--exclude-standard"], cwd=root, text=True
    )
    for path in untracked.splitlines():
        if not (path.startswith(ALLOWED) or path == WORKFLOW):
            continue
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
        if legacy_clock and name in ("manifest.json", "version.json"):
            payload = read_json(file)
            # Exactly the two pre-existing clock-derived values are excluded.
            for key in ("version", "generated_at"):
                payload.pop(key)
            data = encoded(payload)
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
