#!/usr/bin/env python3
import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "coverage", "tmp", "log", ".expo", "data"}
CONFIG_NAMES = {
    "biome.json", "eslint.config.js", "tsconfig.json", "pyproject.toml",
    "ruff.toml", ".ruff.toml", "mypy.ini", "pyrightconfig.json",
    "basedpyrightconfig.json", "setup.cfg", "tox.ini", ".rubocop.yml",
    "steepfile", "package.json",
}
PATTERNS = {
    "eslint_disable": re.compile(r"eslint-disable"),
    "ts_ignore": re.compile(r"@ts-ignore"),
    "ts_expect_error": re.compile(r"@ts-expect-error"),
    "biome_ignore": re.compile(r"biome-ignore"),
    "rubocop_disable": re.compile(r"rubocop:disable"),
    "type_ignore": re.compile(r"type:\s*ignore"),
    "noqa": re.compile(r"#\s*noqa"),
    "word_any": re.compile(r"\bany\b"),
    "as_any": re.compile(r"\bas any\b"),
    "colon_any": re.compile(r":\s*any\b"),
    "any_array": re.compile(r"\bany\[\]"),
}
AREAS = ["web", "mobile", "server", "shared", "scripts", "api", "tools", "tests"]


def rel(path):
    return path.relative_to(ROOT).as_posix()


def walk():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            yield Path(dirpath) / name


def area_of(path):
    parts = Path(path).parts
    if not parts:
        return "(root)"
    if parts[0] in AREAS:
        return parts[0]
    return "(other)"


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def tsconfig_flags():
    flags = {}
    for path in walk():
        if path.name != "tsconfig.json":
            continue
        if "research" in rel(path):
            continue
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        options = data.get("compilerOptions") or {}
        flags[rel(path)] = {
            "strict": options.get("strict"),
            "noUncheckedIndexedAccess": options.get("noUncheckedIndexedAccess"),
            "exactOptionalPropertyTypes": options.get("exactOptionalPropertyTypes"),
            "noImplicitAny": options.get("noImplicitAny"),
            "extends": data.get("extends"),
            "paths": sorted((options.get("paths") or {}).keys()),
        }
    return flags


def package_scripts():
    found = {}
    for path in walk():
        if path.name != "package.json" or "research" in rel(path):
            continue
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        scripts = data.get("scripts") or {}
        found[rel(path)] = {
            "lint": scripts.get("lint"),
            "typecheck": scripts.get("typecheck"),
            "test": scripts.get("test"),
            "format": scripts.get("format"),
            "preflight": scripts.get("preflight"),
        }
    return found


def suppression_counts():
    counts = defaultdict(Counter)
    files = defaultdict(lambda: defaultdict(list))
    for path in walk():
        if path.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx", ".py", ".rb"}:
            continue
        if "research" in rel(path) or rel(path).startswith("docs/review/"):
            continue
        text = path.read_text(errors="replace")
        area = area_of(rel(path))
        for name, pattern in PATTERNS.items():
            hits = len(pattern.findall(text))
            if hits:
                counts[area][name] += hits
                files[area][name].append(rel(path))
    return {area: dict(counter) for area, counter in counts.items()}, {
        area: {name: paths for name, paths in names.items()}
        for area, names in files.items()
    }


def config_presence():
    present = []
    for path in walk():
        if path.name in CONFIG_NAMES and "research" not in rel(path) and not rel(path).startswith("docs/review/"):
            present.append(rel(path))
    absent = []
    for name in ["pyproject.toml", "ruff.toml", "mypy.ini", "basedpyrightconfig.json", ".rubocop.yml"]:
        if not any(path.name == name for path in walk()):
            absent.append(name)
    return sorted(present), absent


def main():
    counts, files = suppression_counts()
    configs, absent = config_presence()
    report = {
        "tsconfig": tsconfig_flags(),
        "package_scripts": package_scripts(),
        "suppression_counts": counts,
        "suppression_files": files,
        "config_files": configs,
        "absent_python_and_ruby_linters": absent,
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "static_analysis.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
