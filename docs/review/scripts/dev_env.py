#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def version(command):
    path = shutil.which(command)
    if path is None:
        return {"present": False}
    result = subprocess.run([command, "--version"], capture_output=True, text=True)
    text = (result.stdout or result.stderr).strip().splitlines()
    return {"present": True, "path": path, "version": text[0] if text else "", "exit_code": result.returncode}


def exists(relative):
    path = ROOT / relative
    info = {"exists": path.exists(), "is_file": path.is_file(), "is_dir": path.is_dir()}
    if path.is_symlink():
        info["symlink_target"] = os.readlink(path)
        info["symlink_ok"] = path.exists()
    return info


def env_keys(relative):
    path = ROOT / relative
    if not path.is_file():
        return None
    keys = []
    for line in path.read_text(errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" in stripped:
            keys.append(stripped.split("=", 1)[0].strip())
    return keys


def sandbox():
    script = ROOT / "api/bin/dev-sandbox"
    if not script.is_file():
        return {"ran": False, "reason": "api/bin/dev-sandbox missing"}
    result = subprocess.run([str(script), "setup"], cwd=ROOT, capture_output=True, text=True, timeout=20)
    return {
        "ran": True,
        "command": "api/bin/dev-sandbox setup",
        "exit_code": result.returncode,
        "stdout": result.stdout[-1000:],
        "stderr": result.stderr[-1000:],
    }


def main():
    report = {
        "tools": {name: version(name) for name in ["python3", "ruby", "bun", "bundle", "psql", "mise", "node", "git"]},
        "files": {
            relative: exists(relative)
            for relative in [
                "mise.toml", ".env.example", "api/.env.example", "server/.env.example",
                "web/.env.example", "mobile/.env.example", "api/bin/dev-sandbox",
                "api/compose.yml", "web/wrangler.jsonc", "web/public/data", "web/data",
                "api/README.md", "server/README.md", "AGENTS.md", ".cursor",
                "BUGBOT.md", "environment.json", "hooks.json",
            ]
        },
        "env_example_keys": {
            relative: env_keys(relative)
            for relative in [".env.example", "api/.env.example", "server/.env.example", "web/.env.example", "mobile/.env.example"]
        },
        "sandbox": sandbox(),
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "dev_env.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
