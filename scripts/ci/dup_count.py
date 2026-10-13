#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path

COUNTERS = ("clones", "duplicatedLines")


def counts_from_report(report: dict) -> dict[str, int]:
    total = report["statistics"]["total"]
    return {key: int(total[key]) for key in COUNTERS}


def over_baseline(current: dict[str, int], baseline: dict) -> list[str]:
    return [key for key in COUNTERS if int(current[key]) > int(baseline[key])]


def clone_lines(report: dict) -> list[str]:
    lines: list[str] = []
    for dup in report.get("duplicates") or []:
        if not isinstance(dup, dict):
            continue
        first = dup.get("firstFile") if isinstance(dup.get("firstFile"), dict) else {}
        second = dup.get("secondFile") if isinstance(dup.get("secondFile"), dict) else {}
        lines.append(
            f"{first.get('name')}:{first.get('start')}-{first.get('end')} "
            f"repeats {second.get('name')}:{second.get('start')}-{second.get('end')}"
        )
    return lines


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: dup_count.py REPORT.json BASELINE.json", file=sys.stderr)
        return 2
    report = json.loads(Path(argv[1]).read_text())
    baseline = json.loads(Path(argv[2]).read_text())
    current = counts_from_report(report)
    raised = over_baseline(current, baseline)
    print(
        "duplicates: "
        + ", ".join(f"{key}={current[key]} baseline={int(baseline[key])}" for key in COUNTERS)
    )
    if not raised:
        return 0
    print(
        "Duplicate count went up (" + ", ".join(raised) + "). "
        "Extract the repeated block into one shared function. The baseline only goes down.",
        file=sys.stderr,
    )
    for line in clone_lines(report):
        print(line, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
