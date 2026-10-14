#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from commit_message import trailer_lines

OWNER_NAME = "jhonnyisaacc"
OWNER_EMAIL = "60485595+jhonnyisaacc@users.noreply.github.com"
# GitHub squash-merge records the account display name, not user.name.
OWNER_NAMES = frozenset({OWNER_NAME, "Jhonny"})
LOG_FORMAT = "%H%x1f%G?%x1f%P%x1f%an%x1f%ae%x1f%B"
USAGE = "usage: commit_audit.py COMMITS.json\n       commit_audit.py --git REV [REV...]"


def flatten_commits(payload: object) -> list[dict]:
    if isinstance(payload, dict) and "commit" in payload:
        return [payload]
    if isinstance(payload, list):
        commits: list[dict] = []
        for item in payload:
            commits.extend(flatten_commits(item))
        return commits
    raise TypeError("commit payload must be a list of GitHub commit objects")


def locally_verified(signature: str, parent_count: int) -> bool:
    # GitHub signs the merges it makes, such as "Update branch", with a key local git
    # cannot check, so those read E here while GitHub shows them Verified.
    return signature in ("G", "U") or (signature == "E" and parent_count >= 2)


def log_commits(output: str) -> list[dict]:
    commits: list[dict] = []
    for record in output.split("\0"):
        if not record:
            continue
        sha, signature, parents, name, email, message = record.split("\x1f", 5)
        commits.append(
            {
                "sha": sha,
                "commit": {
                    "author": {"name": name, "email": email},
                    "message": message,
                    "verification": {"verified": locally_verified(signature, len(parents.split()))},
                },
            }
        )
    return commits


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
    args = argv[1:]
    if len(args) >= 2 and args[0] == "--git":
        log = subprocess.run(
            ["git", "log", "-z", f"--format={LOG_FORMAT}", *args[1:], "--"],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if log.returncode != 0:
            sys.stderr.write(log.stderr)
            return 2
        commits = log_commits(log.stdout)
    elif len(args) == 1 and args[0] != "--git":
        commits = flatten_commits(json.loads(Path(args[0]).read_text()))
    else:
        print(USAGE, file=sys.stderr)
        return 2
    found = problems(commits)
    if found:
        for line in found:
            print(line, file=sys.stderr)
        return 1
    print(f"commits: {len(commits)} verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
