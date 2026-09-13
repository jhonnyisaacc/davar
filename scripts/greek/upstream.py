"""Check recorded Greek sources against their current upstream revisions."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import asdict
from pathlib import Path

from scripts.greek.sources import (
    ALL_SOURCES,
    STEPBIBLE_COMMIT,
    UBS_COMMIT,
    UBS_ES_PATH,
)
from scripts.greek.stable_json import write_json

GITHUB_API = "https://api.github.com"


def _request_json(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "davar-greek-upstream-check",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def _repository_head(repository: str) -> tuple[str, str]:
    metadata = _request_json(f"{GITHUB_API}/repos/{repository}")
    branch = metadata["default_branch"]
    commit = _request_json(
        f"{GITHUB_API}/repos/{repository}/commits/"
        + urllib.parse.quote(branch, safe="")
    )["sha"]
    return branch, commit


def _blob_sha(repository: str, path: str, commit: str) -> str:
    encoded = urllib.parse.quote(path, safe="/")
    payload = _request_json(
        f"{GITHUB_API}/repos/{repository}/contents/{encoded}?ref={commit}"
    )
    return payload["sha"]


def check_upstream() -> dict:
    step_branch, step_head = _repository_head("STEPBible/STEPBible-Data")
    ubs_branch, ubs_head = _repository_head("ubsicap/ubs-open-license")
    sources = []
    for source in ALL_SOURCES:
        latest_blob = _blob_sha(
            "STEPBible/STEPBible-Data",
            source.relative_path,
            step_head,
        )
        sources.append(
            {
                **asdict(source),
                "recorded_commit": STEPBIBLE_COMMIT,
                "latest_commit": step_head,
                "latest_blob_sha": latest_blob,
                "changed": latest_blob != source.blob_sha,
            }
        )
    ubs_blob = _blob_sha("ubsicap/ubs-open-license", UBS_ES_PATH, ubs_head)
    sources.append(
        {
            "key": "ubs-es",
            "relative_path": UBS_ES_PATH,
            "recorded_commit": UBS_COMMIT,
            "latest_commit": ubs_head,
            "recorded_blob_sha": None,
            "latest_blob_sha": ubs_blob,
            "changed": ubs_head != UBS_COMMIT,
        }
    )
    changed = [source["key"] for source in sources if source["changed"]]
    return {
        "changed": changed,
        "has_changes": bool(changed),
        "repositories": {
            "STEPBible/STEPBible-Data": {
                "branch": step_branch,
                "head": step_head,
                "recorded": STEPBIBLE_COMMIT,
            },
            "ubsicap/ubs-open-license": {
                "branch": ubs_branch,
                "head": ubs_head,
                "recorded": UBS_COMMIT,
            },
        },
        "sources": sources,
    }


def write_upstream_report(
    report: dict,
    output: Path,
    markdown_output: Path | None = None,
) -> None:
    write_json(output, report)
    if markdown_output is None:
        return
    changed = report["changed"]
    lines = [
        "# Greek Besorah upstream source check",
        "",
        (
            "Recorded source revisions still match upstream."
            if not changed
            else "Upstream changes require review; no release was updated automatically."
        ),
        "",
    ]
    for repository, revisions in report["repositories"].items():
        lines.append(
            f"- `{repository}`: recorded `{revisions['recorded']}`, "
            f"latest `{revisions['head']}`"
        )
    if changed:
        lines.extend(["", "Changed inputs: " + ", ".join(f"`{key}`" for key in changed)])
    markdown_output.parent.mkdir(parents=True, exist_ok=True)
    markdown_output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_github_output(report: dict, path: Path) -> None:
    with path.open("a", encoding="utf-8") as output:
        output.write(f"changed={'true' if report['has_changes'] else 'false'}\n")
        output.write(f"changed_keys={','.join(report['changed'])}\n")
