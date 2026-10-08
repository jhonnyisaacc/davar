#!/usr/bin/env python3
import json
import os
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "coverage", "tmp", "log", ".expo", "data"}


def rel(path):
    return path.relative_to(ROOT).as_posix()


def walk(suffixes):
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            path = Path(dirpath) / name
            text = rel(path)
            if path.suffix.lower() in suffixes and "research" not in text and not text.startswith("docs/review/"):
                yield path


def search(pattern, suffixes):
    regex = re.compile(pattern)
    hits = []
    for path in walk(suffixes):
        text = path.read_text(errors="replace")
        count = len(regex.findall(text))
        if count:
            hits.append({"path": rel(path), "count": count})
    hits.sort(key=lambda item: item["path"])
    return hits


def feature_dirs():
    found = {}
    for base in [ROOT / "web/src/app/features", ROOT / "mobile/src/features", ROOT / "web/src/app/components", ROOT / "mobile/src/components", ROOT / "mobile/components"]:
        if not base.exists():
            found[rel(base)] = None
            continue
        found[rel(base)] = sorted(p.name for p in base.iterdir())
    return found


def main():
    markers = {
        "TS2009_BOOK_FILE_MAP": search(r"TS2009_BOOK_FILE_MAP", {".ts", ".tsx"}),
        "RAILS_ROUTES": search(r"RAILS_ROUTES", {".ts", ".tsx", ".rb"}),
        "useTranslation_definitions": search(r"export (?:function|const) useTranslation", {".ts", ".tsx"}),
        "zod_imports": search(r"from ['\"]zod['\"]|require\(['\"]zod['\"]\)", {".ts", ".tsx"}),
        "zustand": search(r"from ['\"]zustand['\"]", {".ts", ".tsx"}),
        "ProductClient": search(r"class ProductClient|new ProductClient|function createProductClient", {".ts", ".tsx"}),
        "biome_ignore": search(r"biome-ignore", {".ts", ".tsx"}),
        "workaround_comments": search(r"workaround|hand-maintained|Hand-maintained|legacy format|new consolidated", {".ts", ".tsx", ".py", ".rb", ".md"}),
    }
    bore = sorted(rel(path) for path in ROOT.rglob("bore") if path.is_dir() and "node_modules" not in path.parts and ".git" not in path.parts)
    report = {
        "markers": markers,
        "bore_directories": bore,
        "feature_and_component_dirs": feature_dirs(),
        "http_stacks": {
            "rails_routes": (ROOT / "api/config/routes.rb").is_file(),
            "hono_app": (ROOT / "server/src/http/app.ts").is_file(),
            "rails_gemfile": (ROOT / "api/Gemfile").is_file(),
            "server_package": (ROOT / "server/package.json").is_file(),
        },
        "validation": {
            "server_validation_ts": (ROOT / "server/src/http/validation.ts").is_file(),
            "shared_has_zod": any("zod" in (ROOT / "shared" / name).read_text(errors="replace") for name in os.listdir(ROOT / "shared") if name.endswith(".ts")) if (ROOT / "shared").exists() else False,
        },
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "patterns.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
