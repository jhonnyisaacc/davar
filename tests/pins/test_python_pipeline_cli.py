import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PINS = Path(__file__).resolve().parent


def run_module(args: list[str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    return subprocess.run(
        [sys.executable, "-m", *args],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_dict_help_matches_pin():
    result = run_module(["scripts.dict", "--help"])
    assert result.returncode == 0
    assert result.stderr == ""
    assert result.stdout == (PINS / "dict-help.txt").read_text(encoding="utf-8")
    same = run_module(["scripts.dict.cli", "--help"])
    assert same.returncode == 0
    assert same.stdout == result.stdout


def test_delitzsch_help_matches_pin():
    result = run_module(["scripts.delitzsch", "--help"])
    assert result.returncode == 0
    assert result.stderr == ""
    assert result.stdout == (PINS / "delitzsch-help.txt").read_text(encoding="utf-8")
    same = run_module(["scripts.delitzsch.cli", "--help"])
    assert same.returncode == 0
    assert same.stdout == result.stdout


def test_delitzsch_fixture_subcommand_matches_pin():
    result = run_module(
        [
            "scripts.delitzsch",
            "normalize-holem",
            "--books",
            "__pin_absent__",
            "--dry-run",
        ]
    )
    assert result.returncode == 0
    assert result.stderr == ""
    assert result.stdout == (PINS / "delitzsch-normalize-holem-fixture.txt").read_text(
        encoding="utf-8"
    )
