#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CI = ROOT / "scripts" / "ci"


def run_py(script: str, args: list[str], env: dict | None = None, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    if env is None:
        merged = {key: value for key, value in os.environ.items() if key != "NEEDS"}
    else:
        merged = env
    return subprocess.run(
        [sys.executable, str(CI / script), *args],
        cwd=cwd or ROOT,
        env=merged,
        text=True,
        capture_output=True,
        check=False,
    )


class GateStatusTest(unittest.TestCase):
    def gate(self, needs: dict) -> subprocess.CompletedProcess[str]:
        env = {key: value for key, value in __import__("os").environ.items()}
        env["NEEDS"] = json.dumps(needs)
        return run_py("gate_status.py", [], env=env)

    def test_success_and_skip_pass(self) -> None:
        result = self.gate(
            {
                "hygiene": {"result": "success", "outputs": {"note": "kept"}},
                "web": {"result": "skipped"},
                "source": "additive",
            }
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("gate ok", result.stdout)

    def test_failure_and_cancel_fail(self) -> None:
        failed = self.gate({"api": {"result": "failure"}, "web": {"result": "success"}})
        self.assertEqual(failed.returncode, 1)
        self.assertIn("api", failed.stderr)
        cancelled = self.gate({"python": {"result": "cancelled"}})
        self.assertEqual(cancelled.returncode, 1)
        self.assertIn("python", cancelled.stderr)

    def test_job_without_result_is_ignored(self) -> None:
        result = self.gate({"changes": {"result": "success"}, "note": {"detail": "additive"}})
        self.assertEqual(result.returncode, 0, result.stderr)


class CommitMessageTest(unittest.TestCase):
    def test_strip_removes_ai_trailer_and_keeps_a_human_one(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "msg"
            path.write_text(
                "chore(ci): fold the checks\n\n"
                "Co-authored-by: Cursor <cursoragent@cursor.com>\n"
                "Co-authored-by: Ada <ada@example.com>\n"
            )
            result = run_py("commit_message.py", [str(path)])
            self.assertEqual(result.returncode, 0, result.stderr)
            text = path.read_text()
            self.assertNotIn("cursoragent", text)
            self.assertIn("Ada <ada@example.com>", text)
            checked = run_py("commit_message.py", ["--check", str(path)])
            self.assertEqual(checked.returncode, 0, checked.stderr)

    def test_check_fails_while_an_ai_trailer_remains(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "msg"
            path.write_text("fix: typo\n\nCo-authored-by: Claude <noreply@anthropic.com>\n")
            result = run_py("commit_message.py", ["--check", str(path)])
            self.assertEqual(result.returncode, 1)
            self.assertIn("Claude", result.stderr)


class CommitAuditTest(unittest.TestCase):
    def audit(self, commits: list[dict]) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "commits.json"
            path.write_text(json.dumps(commits))
            return run_py("commit_audit.py", [str(path)])

    def commit(self, **overrides: object) -> dict:
        body = {
            "sha": "abc",
            "commit": {
                "author": {"name": "jhonnyisaacc", "email": "60485595+jhonnyisaacc@users.noreply.github.com"},
                "message": "chore(ci): fold the checks\n",
                "verification": {"verified": True, "reason": "valid"},
                "extra": {"kept": True},
            },
            "files": [],
        }
        body.update(overrides)
        return body

    def test_verified_owner_commit_passes(self) -> None:
        result = self.audit([self.commit()])
        self.assertEqual(result.returncode, 0, result.stderr)
        named = self.commit()
        named["sha"] = "squash"
        named["commit"]["author"] = {
            "name": "Jhonny",
            "email": "60485595+jhonnyisaacc@users.noreply.github.com",
        }
        squash = self.audit([named])
        self.assertEqual(squash.returncode, 0, squash.stderr)

    def test_unverified_wrong_author_and_trailer_fail(self) -> None:
        unsigned = self.commit()
        unsigned["commit"]["verification"] = {"verified": False}
        unsigned["sha"] = "unsigned"
        stranger = self.commit()
        stranger["sha"] = "stranger"
        stranger["commit"]["author"] = {"name": "Cursor Agent", "email": "cursoragent@cursor.com"}
        trailed = self.commit()
        trailed["sha"] = "trailed"
        trailed["commit"]["message"] = "chore: x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>\n"
        result = self.audit([unsigned, stranger, trailed])
        self.assertEqual(result.returncode, 1)
        self.assertIn("unsigned: not Verified", result.stderr)
        self.assertIn("stranger: author is not", result.stderr)
        self.assertIn("trailed: AI co-author trailer", result.stderr)


class BranchNameTest(unittest.TestCase):
    def test_prefixes_and_staging(self) -> None:
        for name in (
            "staging",
            "feat/preview",
            "fix/nav-bar",
            "hotfix/outage",
            "chore/ci-baseline",
            "docs/railway",
            "refactor/run-01",
            "test/gate",
            "release/1",
        ):
            result = run_py("branch_name.py", [name])
            self.assertEqual(result.returncode, 0, name + result.stderr)

    def test_cursor_prefix_and_empty_fail(self) -> None:
        cursor = run_py("branch_name.py", ["cursor/ci-baseline-722a"])
        self.assertEqual(cursor.returncode, 1)
        empty = run_py("branch_name.py", [""])
        self.assertEqual(empty.returncode, 1)
        upper = run_py("branch_name.py", ["Feat/Nav"])
        self.assertEqual(upper.returncode, 1)


class SelectSuitesTest(unittest.TestCase):
    def test_subset_and_placeholder(self) -> None:
        flags = {"bani": "true", "hutter": "true", "morphology": "false", "note": "additive"}
        result = run_py("select_suites.py", ["python", json.dumps(flags)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("python=true", result.stdout)
        self.assertIn('python_suites=["bani","hutter"]', result.stdout)
        idle = run_py("select_suites.py", ["python", "{}"])
        self.assertIn("python=false", idle.stdout)
        self.assertIn('python_suites=["morphology"]', idle.stdout)


class DupCountTest(unittest.TestCase):
    def test_growth_fails_and_names_the_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "report.json"
            baseline = Path(tmp) / "baseline.json"
            report.write_text(
                json.dumps(
                    {
                        "statistics": {"total": {"clones": 2, "duplicatedLines": 40, "percentage": 1}},
                        "duplicates": [
                            {
                                "firstFile": {"name": "a.py", "start": 1, "end": 8},
                                "secondFile": {"name": "b.py", "start": 3, "end": 10},
                            }
                        ],
                    }
                )
            )
            baseline.write_text(json.dumps({"clones": 1, "duplicatedLines": 40, "note": "additive"}))
            result = run_py("dup_count.py", [str(report), str(baseline)])
            self.assertEqual(result.returncode, 1)
            self.assertIn("clones", result.stderr)
            self.assertIn("a.py:1-8 repeats b.py:3-10", result.stderr)

    def test_equal_count_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "report.json"
            baseline = Path(tmp) / "baseline.json"
            report.write_text(json.dumps({"statistics": {"total": {"clones": 1, "duplicatedLines": 10}}}))
            baseline.write_text(json.dumps({"clones": 1, "duplicatedLines": 10}))
            result = run_py("dup_count.py", [str(report), str(baseline)])
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
