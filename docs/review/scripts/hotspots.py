#!/usr/bin/env python3
import json
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rb", ".rake"}
SKIP_PREFIXES = ("data/", "web/public/", "node_modules/", "api/vendor/", "api/tmp/", "api/log/")


def git_sha():
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def line_count(path):
    file_path = ROOT / path
    if not file_path.is_file():
        return 0
    with file_path.open("rb") as handle:
        return sum(1 for _ in handle)


def interesting(path):
    if path.startswith(SKIP_PREFIXES):
        return False
    suffix = Path(path).suffix.lower()
    return suffix in SOURCE_EXT


def collect(rev_args):
    log = subprocess.check_output(["git", "log", "--numstat", "--format=COMMIT %H %cI", *rev_args], cwd=ROOT, text=True, errors="replace")
    commits = defaultdict(int)
    added = defaultdict(int)
    deleted = defaultdict(int)
    current = None
    for line in log.splitlines():
        if line.startswith("COMMIT "):
            current = line.split()[1]
            continue
        parts = line.split("\t")
        if len(parts) != 3 or current is None:
            continue
        plus, minus, path = parts
        if not interesting(path):
            continue
        commits[path] += 1
        if plus != "-":
            added[path] += int(plus)
        if minus != "-":
            deleted[path] += int(minus)
    rows = []
    for path, count in commits.items():
        lines = line_count(path)
        rows.append({
            "path": path,
            "commits": count,
            "added": added[path],
            "deleted": deleted[path],
            "lines": lines,
            "churn_x_size": count * lines,
        })
    rows.sort(key=lambda row: (row["churn_x_size"], row["commits"]), reverse=True)
    return rows


def main():
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=180)).date().isoformat()
    merge_base = subprocess.check_output(["git", "merge-base", "main", "HEAD"], cwd=ROOT, text=True).strip()
    windows = {
        "all_history": collect(["HEAD"]),
        "last_180_days": collect(["HEAD", f"--since={since}"]),
        "since_main_merge_base": collect([f"{merge_base}..HEAD"]),
    }
    report = {
        "sha": git_sha(),
        "merge_base_with_main": merge_base,
        "since_180_days": since,
        "windows": {
            name: {
                "files": len(rows),
                "top_30": rows[:30],
            }
            for name, rows in windows.items()
        },
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "hotspots.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
