#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass
from pathlib import Path

WORKFLOW = ".github/workflows/mobile-eas.yml"
APP_JSON = "mobile/app.json"
START = "# CLASSIFY_START"
END = "# CLASSIFY_END"
MODES = {"build", "update", "skip"}


class CheckError(Exception):
    pass


@dataclass(frozen=True)
class Check:
    mode: str
    before_runtime: object
    after_runtime: object


def git(root: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=root, text=True, capture_output=True)
    if proc.returncode != 0:
        raise CheckError("git %s failed: %s" % (" ".join(args), proc.stderr.strip()))
    return proc.stdout


def extract_classifier(text: str) -> str:
    lines = text.splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == START]
    ends = [i for i, line in enumerate(lines) if line.strip() == END]
    if len(starts) != 1 or len(ends) != 1 or ends[0] < starts[0]:
        raise CheckError(
            "%s must hold exactly one %s ... %s block (found %d start, %d end)"
            % (WORKFLOW, START, END, len(starts), len(ends))
        )
    return textwrap.dedent("".join(lines[starts[0] + 1 : ends[0]]))


def classify(root: Path, before: str, after: str) -> str:
    source = extract_classifier(git(root, "show", "%s:%s" % (after, WORKFLOW)))
    env = {key: value for key, value in os.environ.items() if key != "SELF_TEST"}
    env["BEFORE"] = before
    env["AFTER"] = after
    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / "classify.py"
        script.write_text(source)
        proc = subprocess.run(
            [sys.executable, str(script)], cwd=root, env=env, text=True, capture_output=True
        )
    mode = proc.stdout.strip()
    if proc.returncode != 0 or mode not in MODES:
        raise CheckError(
            "the mobile-eas classifier failed (exit %d, output %r): %s"
            % (proc.returncode, mode, proc.stderr.strip())
        )
    return mode


def runtime_version(root: Path, rev: str) -> object:
    text = git(root, "show", "%s:%s" % (rev, APP_JSON))
    try:
        return json.loads(text).get("expo", {}).get("runtimeVersion")
    except (json.JSONDecodeError, AttributeError) as error:
        raise CheckError("%s at %s is not a JSON object with expo: %s" % (APP_JSON, rev, error))


def suggested_bump(value: object) -> str | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d+(\.\d+)*", value):
        return None
    parts = value.split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    return ".".join(parts)


def verdict(check: Check) -> tuple[bool, str]:
    old = json.dumps(check.before_runtime)
    new = json.dumps(check.after_runtime)
    if check.mode == "build" and check.before_runtime == check.after_runtime:
        bump = suggested_bump(check.before_runtime)
        example = ", e.g. to %s," % json.dumps(bump) if bump else ""
        return False, (
            "runtime-version: this PR changes native mobile code (the mobile-eas classifier says build) "
            "but %s expo.runtimeVersion is still %s. Bump it%s so old binaries never receive updates "
            "built for this one." % (APP_JSON, old, example)
        )
    return True, "runtime-version ok: %s, runtimeVersion %s -> %s" % (check.mode, old, new)


def gather(base: str, head: str) -> Check:
    root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").strip())
    head_sha = git(root, "rev-parse", "--verify", head + "^{commit}").strip()
    before = git(root, "merge-base", base, head_sha).strip()
    return Check(
        mode=classify(root, before, head_sha),
        before_runtime=runtime_version(root, before),
        after_runtime=runtime_version(root, head_sha),
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Fail a native mobile change that keeps runtimeVersion.")
    parser.add_argument("--base", default="origin/main")
    parser.add_argument("--head", default="HEAD")
    args = parser.parse_args(argv)
    try:
        ok, message = verdict(gather(args.base, args.head))
    except CheckError as error:
        print("runtime-version: %s" % error, file=sys.stderr)
        return 1
    print(message, file=sys.stdout if ok else sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
