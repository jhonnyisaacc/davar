#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "coverage", "tmp", "log", ".expo", "data"}
TEST_RE = re.compile(r"(^|/)(test_.*\.py|.*\.test\.(ts|tsx|js|jsx)|.*_test\.rb)$")
RUN_RE = re.compile(r"(pytest|bun test|bun run test|rails test|zeitwerk|biome|tsc |typecheck|lint)")


def rel(path):
    return path.relative_to(ROOT).as_posix()


def walk():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            yield Path(dirpath) / name


def test_files():
    groups = {}
    for path in walk():
        text = rel(path)
        if "research" in text or text.startswith("docs/review/"):
            continue
        if TEST_RE.search(text):
            area = text.split("/", 1)[0]
            groups.setdefault(area, []).append(text)
    return {area: {"count": len(paths), "files": sorted(paths)} for area, paths in sorted(groups.items())}


def workflow_commands():
    found = {}
    workflow_dir = ROOT / ".github/workflows"
    for path in sorted(workflow_dir.glob("*.yml")):
        commands = []
        for line in path.read_text(errors="replace").splitlines():
            stripped = line.strip()
            if stripped.startswith("name:") or stripped.startswith("#"):
                continue
            if RUN_RE.search(stripped):
                commands.append(stripped)
        if commands:
            found[rel(path)] = commands
    return found


def package_test_scripts():
    found = {}
    for path in walk():
        if path.name != "package.json" or "research" in rel(path):
            continue
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        scripts = data.get("scripts") or {}
        found[rel(path)] = {key: scripts.get(key) for key in ("test", "typecheck", "lint", "preflight", "test:static-data") if key in scripts}
    return found


def time_pytest():
    if shutil.which("python3") is None:
        return {"ran": False, "reason": "python3 missing"}
    probe = subprocess.run(["python3", "-c", "import pytest"], cwd=ROOT, capture_output=True, text=True)
    if probe.returncode != 0:
        return {"ran": False, "reason": "pytest is not importable", "stderr": probe.stderr.strip()[:400]}
    start = time.perf_counter()
    result = subprocess.run(["python3", "-m", "pytest", "-q", "tests", "tools/bani/tests"], cwd=ROOT, capture_output=True, text=True)
    elapsed = round(time.perf_counter() - start, 3)
    tail = "\n".join((result.stdout + result.stderr).strip().splitlines()[-20:])
    return {"ran": True, "exit_code": result.returncode, "seconds": elapsed, "tail": tail}


def main():
    report = {
        "test_files": test_files(),
        "package_scripts": package_test_scripts(),
        "workflow_commands": workflow_commands(),
        "pytest_timing": time_pytest(),
        "js_runners": {
            "bun": shutil.which("bun"),
            "ruby": shutil.which("ruby"),
            "bundle": shutil.which("bundle"),
        },
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "tests.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
