#!/usr/bin/env python3
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ANSI = re.compile(r"\x1b\[[0-9;]*m")
SIGNAL = re.compile(
    r"error TS|ValueError|##\[error\]|ENOENT|lint/|ModuleNotFoundError|FileNotFoundError|"
    r"Invalid revision|Your bundle only supports|Found \d+ error|No matching export|"
    r"env:list command failed|ImportError|Process completed with exit code"
)


def gh_json(args):
    result = subprocess.run(["gh", *args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or f"gh failed: {args}")
    return json.loads(result.stdout)


def failed_steps(jobs):
    rows = []
    for job in jobs or []:
        if job.get("conclusion") not in {"failure", "cancelled"}:
            continue
        names = [step.get("name") for step in job.get("steps") or [] if step.get("conclusion") in {"failure", "cancelled"}]
        rows.append({"job": job.get("name"), "conclusion": job.get("conclusion"), "steps": names or ["(no step)"]})
    return rows


def signatures(run_id):
    result = subprocess.run(["gh", "run", "view", str(run_id), "--log-failed"], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        err = (result.stderr or result.stdout).strip().splitlines()
        return {"ok": False, "error": err[-1][:300] if err else "log-failed failed"}
    found = []
    for line in result.stdout.splitlines():
        text = ANSI.sub("", line.split("Z ", 1)[-1]).strip()
        if not SIGNAL.search(text):
            continue
        if any(skip in text for skip in ("Secret source", "const state", "description:")):
            continue
        short = text[:240]
        if short not in found:
            found.append(short)
        if len(found) >= 12:
            break
    return {"ok": True, "lines": found}


def main():
    runs = gh_json(["run", "list", "--status", "failure", "--limit", "100", "--json", "databaseId,workflowName,headBranch,displayTitle,createdAt,url,event,conclusion"])
    grouped = []
    buckets = Counter()
    for run in runs:
        detail = gh_json(["run", "view", str(run["databaseId"]), "--json", "jobs,conclusion,workflowName,url"])
        steps = failed_steps(detail.get("jobs"))
        key = (run["workflowName"], json.dumps(steps, sort_keys=True))
        buckets[key] += 1
        grouped.append({**run, "failed": steps})
    samples = {}
    for item in grouped:
        if not item["failed"]:
            label = item["workflowName"] + "|(no job)"
        else:
            step_names = ",".join(item["failed"][0]["steps"])
            label = item["workflowName"] + "|" + step_names
        samples.setdefault(label, item["databaseId"])
    sample_logs = {}
    for label, run_id in samples.items():
        sample_logs[label] = {"run_id": run_id, **signatures(run_id)}
    counts = [{"workflow": key[0], "failed": json.loads(key[1]), "count": count} for key, count in buckets.most_common()]
    report = {
        "failure_count": len(runs),
        "oldest": runs[-1]["createdAt"] if runs else None,
        "newest": runs[0]["createdAt"] if runs else None,
        "by_workflow": dict(Counter(run["workflowName"] for run in runs)),
        "by_branch": dict(Counter(run["headBranch"] for run in runs).most_common()),
        "groups": counts,
        "sample_logs": sample_logs,
        "runs": [{k: run[k] for k in ("databaseId", "createdAt", "workflowName", "headBranch", "displayTitle", "url")} | {"failed": run["failed"]} for run in grouped],
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "ci_failures.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
