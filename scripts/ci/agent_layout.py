#!/usr/bin/env python3

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

CANONICAL = ".agents/skills"
LINKS = {".claude/skills": "../.agents/skills"}
FORBIDDEN = (".cursor/skills", ".github/skills", ".codex/skills")
SCANNED = (".agents", "AGENTS.md")
HOME_PATH = re.compile(r"/(?:Users|home)/[^/\s]+/")
SYMLINK_MODE = "120000"


def git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=root, text=True, capture_output=True, check=True
    ).stdout


def tracked(root: Path, *paths: str) -> list[tuple[str, str, str]]:
    out = git(root, "ls-files", "-s", "-z", "--", *paths)
    entries = []
    for record in filter(None, out.split("\0")):
        meta, path = record.split("\t", 1)
        mode, blob, _ = meta.split()
        entries.append((mode, blob, path))
    return entries


def link_failures(root: Path) -> list[str]:
    failures = []
    for link, target in LINKS.items():
        fix = f"run: git rm -r --cached {link}; rm -rf {link}; ln -s {target} {link}; git add {link}"
        entries = tracked(root, link)
        exact = [entry for entry in entries if entry[2] == link]
        if not entries:
            failures.append(f"{link} is not tracked; {fix}")
        elif not exact:
            failures.append(f"{link} is a directory of {len(entries)} tracked files, not a symlink to {target}; move its skills into {CANONICAL}, then {fix}")
        elif exact[0][0] != SYMLINK_MODE:
            failures.append(f"{link} is a regular file, not a symlink to {target}; {fix}")
        else:
            actual = git(root, "cat-file", "blob", exact[0][1])
            if actual != target:
                failures.append(f"{link} points to {actual}, not {target}; {fix}")
    return failures


def forbidden_failures(root: Path) -> list[str]:
    failures = []
    for folder in FORBIDDEN:
        entries = tracked(root, folder)
        if entries:
            failures.append(
                f"{folder} holds {len(entries)} tracked files; skills live only in {CANONICAL}, so git mv them there and delete {folder}"
            )
    return failures


def frontmatter_name(text: str) -> str | None:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    for line in lines[1:]:
        if line.strip() == "---":
            return None
        key, _, value = line.partition(":")
        if key.strip() == "name":
            return value.strip().strip("'\"")
    return None


def name_failures(root: Path) -> list[str]:
    failures = []
    for _, _, path in tracked(root, CANONICAL):
        parts = path.split("/")
        if len(parts) != 4 or parts[3] != "SKILL.md":
            continue
        folder = parts[2]
        name = frontmatter_name((root / path).read_text(encoding="utf-8"))
        if name is None:
            failures.append(f"{path} has no frontmatter name; add 'name: {folder}' between the opening --- lines")
        elif name != folder:
            failures.append(f"{path} has name '{name}' but lives in '{folder}'; rename the folder or set 'name: {folder}'")
    return failures


def home_path_failures(root: Path) -> list[str]:
    failures = []
    for mode, _, path in tracked(root, *SCANNED):
        if mode == SYMLINK_MODE:
            continue
        text = (root / path).read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), 1):
            match = HOME_PATH.search(line)
            if match:
                failures.append(f"{path}:{number} has the home path {match.group(0)}; use a repo-relative path or ~ instead")
    return failures


def main() -> int:
    root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").strip())
    failures = [
        *link_failures(root),
        *forbidden_failures(root),
        *name_failures(root),
        *home_path_failures(root),
    ]
    for failure in failures:
        print(f"agent-layout: {failure}", file=sys.stderr)
    if failures:
        return 1
    print("agent-layout ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
