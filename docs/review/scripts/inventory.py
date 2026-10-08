#!/usr/bin/env python3
import json
import os
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rb", ".rake"}
SKIP_DIRS = {
    ".git", "node_modules", "vendor", "dist", "coverage", "tmp", "log",
    ".expo", "ios", "android",
}
ENTRY_NAMES = {
    "main.tsx", "main.ts", "index.ts", "server.ts", "config.ru", "Rakefile",
    "Gemfile", "__main__.py", "cli.py",
}


def git_sha():
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def rel(path):
    return path.relative_to(ROOT).as_posix()


def walk_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            yield Path(dirpath) / name


def line_count(path):
    try:
        with path.open("rb") as handle:
            return sum(1 for _ in handle)
    except OSError:
        return 0


def top(path):
    parts = path.relative_to(ROOT).parts
    return parts[0] if len(parts) > 1 else "(root)"


def manifests():
    names = [
        "package.json", "Gemfile", "requirements.txt", "mise.toml",
        "app.json", "eas.json", "wrangler.jsonc", "compose.yml",
    ]
    found = []
    for path in walk_files():
        if path.name in names and "research" not in rel(path):
            found.append(rel(path))
    return sorted(found)


def entrypoints(files):
    hits = []
    for path in files:
        name = path.name
        if name in ENTRY_NAMES or (path.parent.name == "bin" and path.suffix in {"", ".rb"}):
            hits.append(rel(path))
    return sorted(hits)


def main():
    files = list(walk_files())
    by_top_ext = defaultdict(lambda: Counter())
    by_top_lines = defaultdict(lambda: Counter())
    largest = []
    over_1000 = []
    for path in files:
        ext = path.suffix.lower()
        if ext not in SOURCE_EXT:
            continue
        if rel(path).startswith("data/") or rel(path).startswith("docs/review/") or "/research/" in rel(path):
            continue
        lines = line_count(path)
        area = top(path)
        by_top_ext[area][ext] += 1
        by_top_lines[area][ext] += lines
        item = {"path": rel(path), "lines": lines}
        largest.append(item)
        if lines >= 1000:
            over_1000.append(item)
    largest.sort(key=lambda item: item["lines"], reverse=True)
    over_1000.sort(key=lambda item: item["lines"], reverse=True)
    areas = {}
    for area in sorted(set(by_top_ext) | set(by_top_lines)):
        areas[area] = {
            "files": dict(by_top_ext[area]),
            "lines": dict(by_top_lines[area]),
            "source_files": sum(by_top_ext[area].values()),
            "source_lines": sum(by_top_lines[area].values()),
        }
    data_bytes = 0
    data_files = 0
    data_root = ROOT / "data"
    if data_root.exists():
        for path in data_root.rglob("*"):
            if path.is_file():
                data_files += 1
                data_bytes += path.stat().st_size
    report = {
        "sha": git_sha(),
        "branch": subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, text=True).strip(),
        "areas": areas,
        "largest_source_files": largest[:40],
        "files_at_least_1000_lines": over_1000,
        "entrypoints": entrypoints(files),
        "manifests": manifests(),
        "data": {"files": data_files, "bytes": data_bytes},
        "top_level": sorted(p.name for p in ROOT.iterdir() if p.is_dir() and not p.name.startswith(".")),
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "inventory.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
