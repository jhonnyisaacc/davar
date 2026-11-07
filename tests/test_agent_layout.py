#!/usr/bin/env python3

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ci" / "agent_layout.py"


class LayoutRepo:
    def __init__(self, root: Path) -> None:
        self.path = root
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env["GIT_CONFIG_GLOBAL"] = str(root / ".gitconfig-none")
        self.env["GIT_CONFIG_NOSYSTEM"] = "1"
        self.git("init", "-q", "-b", "main")
        self.write(".agents/skills/verify/SKILL.md", "---\nname: verify\ndescription: drive the app\n---\n\n# Verify\n")
        self.write("AGENTS.md", "# Repo\n\nSkills live in .agents/skills.\n")
        self.link(".claude/skills", "../.agents/skills")

    def git(self, *args: str) -> None:
        subprocess.run(["git", *args], cwd=self.path, env=self.env, check=True, capture_output=True)

    def write(self, path: str, text: str) -> None:
        target = self.path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        self.git("add", path)

    def link(self, path: str, target: str) -> None:
        location = self.path / path
        location.parent.mkdir(parents=True, exist_ok=True)
        location.symlink_to(target)
        self.git("add", path)

    def remove(self, path: str) -> None:
        self.git("rm", "-rqf", path)

    def check(self, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=cwd or self.path,
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
        )


class AgentLayoutTest(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = LayoutRepo(Path(tmp.name).resolve())

    def assert_fails(self, *fragments: str) -> None:
        result = self.repo.check()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertNotIn("agent-layout ok", result.stdout)
        for fragment in fragments:
            self.assertIn(fragment, result.stderr)

    def test_canonical_layout_passes(self) -> None:
        result = self.repo.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "agent-layout ok")

    def test_passes_from_a_subdirectory(self) -> None:
        result = self.repo.check(cwd=self.repo.path / ".agents")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_link_fails_with_the_fix(self) -> None:
        self.repo.remove(".claude/skills")
        self.assert_fails(".claude/skills is not tracked", "ln -s ../.agents/skills .claude/skills")

    def test_link_with_another_target_fails(self) -> None:
        self.repo.remove(".claude/skills")
        self.repo.link(".claude/skills", "../.cursor/skills")
        self.assert_fails(".claude/skills points to ../.cursor/skills, not ../.agents/skills")

    def test_link_replaced_by_a_directory_fails(self) -> None:
        self.repo.remove(".claude/skills")
        self.repo.write(".claude/skills/verify/SKILL.md", "---\nname: verify\n---\n")
        self.assert_fails(".claude/skills is a directory of 1 tracked files", "move its skills into .agents/skills")

    def test_link_replaced_by_a_file_fails(self) -> None:
        self.repo.remove(".claude/skills")
        self.repo.write(".claude/skills", "../.agents/skills")
        self.assert_fails(".claude/skills is a regular file")

    def test_each_forbidden_folder_fails_when_tracked(self) -> None:
        for folder in (".cursor/skills", ".github/skills", ".codex/skills"):
            with self.subTest(folder=folder):
                self.repo.write(f"{folder}/extra/SKILL.md", "---\nname: extra\n---\n")
                self.assert_fails(f"{folder} holds 1 tracked files", "git mv them there")
                self.repo.remove(folder)

    def test_untracked_forbidden_file_is_ignored(self) -> None:
        stray = self.repo.path / ".cursor/skills/local/SKILL.md"
        stray.parent.mkdir(parents=True)
        stray.write_text("---\nname: local\n---\n")
        result = self.repo.check()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_skill_name_must_match_its_folder(self) -> None:
        self.repo.write(".agents/skills/refactor-pro/SKILL.md", "---\nname: refactor\n---\n")
        self.assert_fails(".agents/skills/refactor-pro/SKILL.md has name 'refactor' but lives in 'refactor-pro'")

    def test_skill_without_frontmatter_name_fails(self) -> None:
        self.repo.write(".agents/skills/seo/SKILL.md", "# SEO\n")
        self.assert_fails(".agents/skills/seo/SKILL.md has no frontmatter name", "name: seo")

    def test_quoted_name_passes(self) -> None:
        self.repo.write(".agents/skills/seo/SKILL.md", "---\nname: \"seo\"\n---\n")
        result = self.repo.check()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_home_paths_fail_in_agents_md_and_skills(self) -> None:
        self.repo.write("AGENTS.md", "# Repo\n\nRun from /Users/jhonny/davar.\n")
        self.repo.write(".agents/skills/verify/features/web.md", "cd /home/runner/davar/web\n")
        self.assert_fails(
            "AGENTS.md:3 has the home path /Users/jhonny/",
            ".agents/skills/verify/features/web.md:1 has the home path /home/runner/",
            "use a repo-relative path or ~",
        )

    def test_home_path_outside_the_scanned_tree_passes(self) -> None:
        self.repo.write("docs/review/old.md", "/Users/jhonny/davar\n")
        result = self.repo.check()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_every_failure_is_reported_on_its_own_line(self) -> None:
        self.repo.remove(".claude/skills")
        self.repo.write(".github/skills/xai/SKILL.md", "---\nname: xai\n---\n")
        result = self.repo.check()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(result.stderr.strip().splitlines()), 2, result.stderr)


if __name__ == "__main__":
    unittest.main()
