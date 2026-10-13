#!/usr/bin/env python3

from __future__ import annotations

import re
import sys

PATTERN = re.compile(r"^(feat|fix|hotfix|chore|docs|refactor|test|release)/[a-z0-9][a-z0-9-]*$")


def allowed(name: str) -> bool:
    return PATTERN.fullmatch(name) is not None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: branch_name.py HEAD_REF", file=sys.stderr)
        return 2
    name = argv[1]
    if not name:
        print("Head branch is empty.", file=sys.stderr)
        return 1
    if allowed(name):
        return 0
    print(f"Head branch '{name}' does not match {PATTERN.pattern}.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
