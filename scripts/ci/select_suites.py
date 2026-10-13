#!/usr/bin/env python3

from __future__ import annotations

import json
import sys

GROUPS = {
    "python": (
        "morphology",
        "bani",
        "translit",
        "besorah",
        "greek-source",
        "hutter",
    ),
}


def select(group: str, flags: dict) -> tuple[bool, list[str]]:
    names = GROUPS[group]
    chosen = [name for name in names if flags.get(name) == "true"]
    if chosen:
        return True, chosen
    return False, [names[0]]


def format_output(group: str, flags: dict) -> str:
    active, suites = select(group, flags)
    matrix = json.dumps(suites, separators=(",", ":"))
    state = "true" if active else "false"
    return f"{group}={state}\n{group}_suites={matrix}\n"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: select_suites.py GROUP FLAGS_JSON", file=sys.stderr)
        return 2
    group = argv[1]
    if group not in GROUPS:
        print(f"unknown group: {group}", file=sys.stderr)
        return 2
    flags = json.loads(argv[2])
    if not isinstance(flags, dict):
        print("flags must be a JSON object", file=sys.stderr)
        return 2
    sys.stdout.write(format_output(group, flags))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
