#!/usr/bin/env python3
"""Print the pull_request workflows whose filters match a set of paths."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"
MOVED_PYTEST = {
    "tests/test_delitzsch_review.py": "Besorah quality",
    "tests/test_greek_importer.py": "Greek source quality",
    "tests/test_greek_release.py": "Greek source quality",
    "tests/test_merge_strongs.py": "Besorah quality",
}


def glob_match(pattern: str, path: str) -> bool:
    parts: list[str] = []
    index = 0
    while index < len(pattern):
        if pattern.startswith("**/", index):
            parts.append("(?:.*/)?")
            index += 3
        elif pattern.startswith("**", index):
            parts.append(".*")
            index += 2
        elif pattern[index] == "*":
            parts.append("[^/]*")
            index += 1
        elif pattern[index] == "?":
            parts.append("[^/]")
            index += 1
        else:
            parts.append(re.escape(pattern[index]))
            index += 1
    return re.fullmatch("".join(parts), path) is not None


def unquote(token: str) -> str:
    token = token.strip().strip(",").strip()
    if len(token) >= 2 and token[0] == token[-1] and token[0] in {'"', "'"}:
        return token[1:-1]
    return token


def parse_flow(value: str) -> list[str]:
    inner = value.strip()
    if inner.startswith("[") and inner.endswith("]"):
        inner = inner[1:-1]
    return [unquote(part) for part in inner.split(",") if unquote(part)]


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def block_after(lines: list[str], start: int) -> list[str]:
    """Return lines in the section that begins on start, including that line."""
    if start >= len(lines):
        return []
    header_indent = indent_of(lines[start])
    body = [lines[start]]
    for line in lines[start + 1 :]:
        if not line.strip() or line.lstrip().startswith("#"):
            body.append(line)
            continue
        if indent_of(line) <= header_indent:
            break
        body.append(line)
    return body


def list_value(body: list[str], key: str) -> list[str] | None:
    prefix = " " * indent_of(body[0])
    for index, line in enumerate(body[1:], start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith(f"{key}:"):
            rest = stripped.split(":", 1)[1].strip()
            if rest:
                return parse_flow(rest)
            items: list[str] = []
            key_indent = indent_of(line)
            for follower in body[index + 1 :]:
                if not follower.strip():
                    continue
                if indent_of(follower) <= key_indent:
                    break
                item = follower.strip()
                if item.startswith("- "):
                    items.append(unquote(item[2:]))
            return items
    return None


def on_section(lines: list[str]) -> list[str]:
    for index, line in enumerate(lines):
        if line == "on:" or line.startswith("on:"):
            return block_after(lines, index)
    return []


def parse_workflow(path: Path) -> dict:
    lines = path.read_text().splitlines()
    name = path.stem
    for line in lines:
        if line.startswith("name:"):
            name = unquote(line.split(":", 1)[1].strip())
            break
    section = on_section(lines)
    pull_request = None
    for index, line in enumerate(section):
        if line.strip() == "pull_request:" or line.strip().startswith("pull_request:"):
            pull_request = block_after(section, index)
            break
    pytest_tokens: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("- run:") or stripped.startswith("run:"):
            command = stripped.split(":", 1)[1].strip()
            if "pytest" in command:
                pytest_tokens.extend(command.split())
    record = {
        "file": path.name,
        "name": name,
        "pull_request": pull_request is not None,
        "branches": None,
        "paths": None,
        "pytest_tokens": pytest_tokens,
    }
    if pull_request is not None and len(pull_request) > 1:
        record["branches"] = list_value(pull_request, "branches")
        record["paths"] = list_value(pull_request, "paths")
    return record


def load_workflows() -> list[dict]:
    return [parse_workflow(path) for path in sorted(WORKFLOWS.glob("*.yml"))]


def path_selected(paths: list[str] | None, changed: list[str]) -> bool:
    if paths is None:
        return True
    included = [pattern for pattern in paths if not pattern.startswith("!")]
    excluded = [pattern[1:] for pattern in paths if pattern.startswith("!")]
    for changed_path in changed:
        if any(glob_match(pattern, changed_path) for pattern in excluded):
            continue
        if any(glob_match(pattern, changed_path) for pattern in included):
            return True
    return False


def workflow_fires(workflow: dict, changed: list[str], base: str) -> bool:
    if not workflow["pull_request"]:
        return False
    branches = workflow["branches"]
    if branches is not None and base not in branches:
        return False
    return path_selected(workflow["paths"], changed)


def firing(changed: list[str], base: str) -> list[str]:
    return [
        workflow["name"]
        for workflow in load_workflows()
        if workflow_fires(workflow, changed, base)
    ]


def pytest_owners() -> dict[str, list[str]]:
    owners = {path: [] for path in MOVED_PYTEST}
    for workflow in load_workflows():
        for token in workflow["pytest_tokens"]:
            for path in MOVED_PYTEST:
                if glob_match(token, path) or token == path:
                    owners[path].append(workflow["name"])
    return {path: sorted(set(names)) for path, names in owners.items()}


def expect(actual: list[str], expected: set[str], label: str, failures: list[str]) -> None:
    if set(actual) != expected:
        failures.append(
            f"{label}\n  actual: {sorted(actual)}\n  expected: {sorted(expected)}"
        )


def self_check() -> int:
    failures: list[str] = []
    always = {"Branch name", "legacy-names", "Policy Gate"}
    expect(
        firing(["mobile/App.tsx"], "main"),
        always | {"Mobile CI"},
        "mobile/App.tsx on main",
        failures,
    )
    expect(
        firing(["web/src/main.tsx"], "main"),
        always | {"Web CI", "Web Preview"},
        "web/src/main.tsx on main",
        failures,
    )
    expect(
        firing(["docs/README.md"], "main"),
        always,
        "docs/README.md on main",
        failures,
    )
    expect(
        firing(["data/delitzsch/parsed/john/1.json"], "main"),
        always | {"Besorah quality", "Knowledge foundation"},
        "data/delitzsch/parsed/john/1.json on main",
        failures,
    )
    expect(
        firing(["scripts/hutter/morphology.py"], "main"),
        always | {"Python CI", "Hutter transcription QA"},
        "scripts/hutter/morphology.py on main",
        failures,
    )
    expect(
        firing(["scripts/translit/local_translit.py"], "main"),
        always | {"Transliteration quality"},
        "scripts/translit/local_translit.py on main",
        failures,
    )
    expect(
        firing(["mobile/App.tsx"], "feat/preview-api-railway"),
        {"Branch name", "legacy-names", "Policy Gate", "Mobile CI"},
        "mobile/App.tsx on the preview stack base",
        failures,
    )
    expect(
        firing(["docs/README.md"], "feat/unrelated"),
        {"Branch name", "legacy-names"},
        "docs/README.md on an unlisted base",
        failures,
    )
    owners = pytest_owners()
    for path, owner in MOVED_PYTEST.items():
        if owners[path] != [owner]:
            failures.append(f"pytest owner for {path}: {owners[path]}")
    if failures:
        print("\n\n".join(failures), file=sys.stderr)
        return 1
    print("which-workflows: ok")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="main")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("paths", nargs="*")
    args = parser.parse_args()
    if args.check:
        return self_check()
    if not args.paths:
        parser.error("pass at least one path, or pass --check")
    for name in firing(args.paths, args.base):
        print(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
