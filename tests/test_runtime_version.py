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
SCRIPT = ROOT / "scripts" / "ci" / "runtime_version.py"
WORKFLOW = ROOT / ".github" / "workflows" / "mobile-eas.yml"


class RuntimeVersionTest(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name).resolve()
        self.repo = root / "repo"
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env["GIT_CONFIG_GLOBAL"] = str(root / "gitconfig")
        self.env["GIT_CONFIG_NOSYSTEM"] = "1"
        (root / "gitconfig").write_text(
            "[user]\n\tname = runtime\n\temail = runtime@example.com\n[commit]\n\tgpgsign = false\n"
        )
        self.repo.mkdir()
        self.git("init", "-q", "-b", "main")
        self.write(".github/workflows/mobile-eas.yml", WORKFLOW.read_text())
        self.app = {"expo": {"name": "Davar", "version": "1.0.0", "runtimeVersion": "1.0.4"}}
        self.write_json("mobile/app.json", self.app)
        self.pkg = {"name": "mobile", "version": "1.0.0", "dependencies": {"expo": "~54.0.0"}}
        self.write_json("mobile/package.json", self.pkg)
        self.write("mobile/src/index.ts", "export {}\n")
        self.write("docs/notes.md", "notes\n")
        self.commit("base")
        self.git("checkout", "-q", "-b", "chore/change")

    def git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args], cwd=self.repo, env=self.env, text=True, capture_output=True, check=True
        ).stdout

    def write(self, rel: str, text: str) -> None:
        path = self.repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def write_json(self, rel: str, value: dict) -> None:
        self.write(rel, json.dumps(value, indent=2) + "\n")

    def commit(self, message: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)

    def bump(self) -> None:
        self.app["expo"]["runtimeVersion"] = "1.0.5"
        self.write_json("mobile/app.json", self.app)

    def check(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--base", "main"],
            cwd=self.repo,
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
        )

    def assert_passes(self, mode: str, old: str, new: str) -> None:
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.strip(), 'runtime-version ok: %s, runtimeVersion "%s" -> "%s"' % (mode, old, new)
        )

    def assert_needs_bump(self) -> None:
        result = self.check()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("the mobile-eas classifier says build", result.stderr)
        self.assertIn('expo.runtimeVersion is still "1.0.4"', result.stderr)
        self.assertIn('e.g. to "1.0.5"', result.stderr)

    def test_js_only_change_passes_as_update(self) -> None:
        self.write("mobile/src/index.ts", "export const a = 1\n")
        self.commit("js")
        self.assert_passes("update", "1.0.4", "1.0.4")

    def test_native_project_change_without_bump_fails(self) -> None:
        self.write("mobile/ios/Podfile", "platform :ios\n")
        self.commit("ios")
        self.assert_needs_bump()

    def test_native_project_change_with_bump_passes(self) -> None:
        self.write("mobile/ios/Podfile", "platform :ios\n")
        self.bump()
        self.commit("ios and bump")
        self.assert_passes("build", "1.0.4", "1.0.5")

    def test_native_dependency_without_bump_fails(self) -> None:
        self.pkg["dependencies"]["expo-camera"] = "~17.0.0"
        self.write_json("mobile/package.json", self.pkg)
        self.commit("camera")
        self.assert_needs_bump()

    def test_change_outside_mobile_passes_as_skip(self) -> None:
        self.write("docs/notes.md", "more notes\n")
        self.commit("docs")
        self.assert_passes("skip", "1.0.4", "1.0.4")

    def test_missing_markers_fail(self) -> None:
        text = WORKFLOW.read_text().replace("# CLASSIFY_START", "# CLASSIFY_BEGIN")
        self.write(".github/workflows/mobile-eas.yml", text)
        self.write("mobile/src/index.ts", "export const a = 1\n")
        self.commit("break markers")
        result = self.check()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("# CLASSIFY_START", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_classifier_failure_fails(self) -> None:
        self.write("mobile/app.json", "{ not json\n")
        self.commit("broken app.json")
        result = self.check()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("the mobile-eas classifier failed", result.stderr)


if __name__ == "__main__":
    unittest.main()
