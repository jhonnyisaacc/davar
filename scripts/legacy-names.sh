#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import sys
from pathlib import Path

patterns = (
    "RAILS_",
    "RACK_ENV",
    "bin/rails",
    "bin/setup",
    "config/environments",
    "database.yml",
    "ActiveRecord",
    "Rails.",
)
skip_dirs = {"node_modules", ".git", "__pycache__"}
matches = []

api_root = Path("api")
if not api_root.is_dir():
    print("legacy-names: api/ missing", file=sys.stderr)
    sys.exit(1)

for path in sorted(api_root.rglob("*")):
    if not path.is_file():
        continue
    if any(part in skip_dirs for part in path.parts):
        continue
    rel = path.as_posix()
    for pattern in patterns:
        if pattern in rel:
            matches.append(f"{rel}: path")
            break
    text = path.read_bytes().decode("utf-8", errors="replace")
    for lineno, line in enumerate(text.splitlines(), 1):
        for pattern in patterns:
            if pattern in line:
                matches.append(f"{rel}:{lineno}: {pattern}")
                break

if matches:
    print(f"legacy-names: {len(matches)} match(es) in api/ (baseline 0)", file=sys.stderr)
    for item in matches:
        print(item, file=sys.stderr)
    sys.exit(1)
print("legacy-names: 0")
PY
