#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import sys

BAD_RESULTS = frozenset({"failure", "cancelled"})


def failing_jobs(needs: dict) -> list[str]:
    failed: list[str] = []
    for name, info in needs.items():
        if not isinstance(info, dict) or "result" not in info:
            continue
        if info.get("result") in BAD_RESULTS:
            failed.append(str(name))
    return failed


def main() -> int:
    raw = os.environ.get("NEEDS")
    if raw is None:
        print("NEEDS is empty", file=sys.stderr)
        return 2
    needs = json.loads(raw)
    if not isinstance(needs, dict):
        print("NEEDS must be a JSON object", file=sys.stderr)
        return 2
    failed = failing_jobs(needs)
    if failed:
        print("failed or cancelled: " + ", ".join(failed), file=sys.stderr)
        return 1
    print("gate ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
