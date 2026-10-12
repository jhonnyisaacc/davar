#!/usr/bin/env python3
import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
KEYWORDS = ("fix", "revert", "wrong", "incorrect", "should", "bug", "mistake", "review", "don't", "do not")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True, errors="replace")


def subjects(args, limit):
    text = git("log", "--all", f"-n{limit}", "--format=%h%x09%ad%x09%an%x09%s", "--date=short", *args)
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        sha, date, author, subject = line.split("\t", 3)
        rows.append({"sha": sha, "date": date, "author": author, "subject": subject})
    return rows


def gh_json(args):
    result = subprocess.run(["gh", *args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        return {"error": (result.stderr or result.stdout).strip()[:500]}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"error": "non-json", "text": result.stdout[:500]}


def review_comments():
    result = subprocess.run(
        ["gh", "api", "--paginate", "repos/jhonnyisaacc/davar/pulls/comments?per_page=100"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode != 0:
        return {"error": result.stderr.strip()[:500]}
    try:
        comments = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"error": "non-json", "bytes": len(result.stdout)}
    if isinstance(comments, dict):
        comments = comments.get("items") or []
    authors = Counter((item.get("user") or {}).get("login") or "unknown" for item in comments)
    samples = []
    for item in comments:
        body = (item.get("body") or "").replace("\r", " ").replace("\n", " ")
        lower = body.lower()
        if not any(word in lower for word in KEYWORDS):
            continue
        samples.append({
            "id": item.get("id"),
            "user": (item.get("user") or {}).get("login"),
            "path": item.get("path"),
            "pull": (item.get("pull_request_url") or "").rsplit("/", 1)[-1],
            "created": item.get("created_at"),
            "body": body[:280],
        })
        if len(samples) >= 40:
            break
    return {"count": len(comments), "authors": dict(authors), "keyword_samples": samples}


def pr_250():
    return gh_json([
        "pr", "view", "250", "--json",
        "number,title,isDraft,baseRefName,headRefName,url,author,reviewDecision,comments,reviews,state",
    ])


def main():
    authors = git("shortlog", "-sn", "--all")
    author_rows = []
    for line in authors.splitlines():
        count, name = line.strip().split("\t", 1) if "\t" in line else line.strip().split(None, 1)
        author_rows.append({"commits": int(count), "author": name})
    report = {
        "authors": author_rows,
        "revert_subjects": subjects(["--regexp-ignore-case", "--grep=revert"], 50),
        "cursor_agent_subjects": subjects(["--author=Cursor Agent"], 60),
        "copilot_subjects": subjects(["--author=copilot-swe-agent"], 40),
        "pr_250": pr_250(),
        "review_comments": review_comments(),
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "agent_history.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
