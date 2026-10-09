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
pinned_root = Path("server/lib/bore")
api_bore = Path("api/lib/bore")
matches = []

def pinned_copy(path: Path) -> bool:
    try:
        rel = path.relative_to(pinned_root)
    except ValueError:
        return False
    other = api_bore / rel
    return other.is_file() and other.read_bytes() == path.read_bytes()

for path in sorted(Path("server").rglob("*")):
    if not path.is_file():
        continue
    if any(part in skip_dirs for part in path.parts):
        continue
    if pinned_copy(path):
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
    print(f"legacy-names: {len(matches)} match(es) in server/ (baseline 0)", file=sys.stderr)
    for item in matches:
        print(item, file=sys.stderr)
    sys.exit(1)
print("legacy-names: 0")
PY
