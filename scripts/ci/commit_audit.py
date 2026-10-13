#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from commit_message import trailer_lines

OWNER_NAME = "jhonnyisaacc"
OWNER_EMAIL = "60485595+jhonnyisaacc@users.noreply.github.com"
# GitHub squash-merge records the account display name, not user.name.
OWNER_NAMES = frozenset({OWNER_NAME, "Jhonny"})


def flatten_commits(payload: object) -> list[dict]:
    if isinstance(payload, dict) and "commit" in payload:
        return [payload]
    if isinstance(payload, list):
        commits: list[dict] = []
        for item in payload:
            commits.extend(flatten_commits(item))
        return commits
    raise TypeError("commit payload must be a list of GitHub commit objects")


def problems(commits: list[dict]) -> list[str]:
    found: list[str] = []
    if not commits:
        return ["pull request has no commits"]
    for commit in commits:
        sha = str(commit.get("sha", "?"))
        body = commit.get("commit")
        if not isinstance(body, dict):
            found.append(f"{sha}: missing commit object")
            continue
        author = body.get("author") if isinstance(body.get("author"), dict) else {}
        verification = body.get("verification") if isinstance(body.get("verification"), dict) else {}
        message = body.get("message") if isinstance(body.get("message"), str) else ""
        if verification.get("verified") is not True:
            found.append(f"{sha}: not Verified")
        if author.get("name") not in OWNER_NAMES or author.get("email") != OWNER_EMAIL:
            found.append(f"{sha}: author is not {OWNER_NAME} <{OWNER_EMAIL}>")
        if trailer_lines(message):
            found.append(f"{sha}: AI co-author trailer")
    return found


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: commit_audit.py COMMITS.json", file=sys.stderr)
        return 2
    payload = json.loads(Path(argv[1]).read_text())
    found = problems(flatten_commits(payload))
    if found:
        for line in found:
            print(line, file=sys.stderr)
        return 1
    print(f"commits: {len(flatten_commits(payload))} verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
