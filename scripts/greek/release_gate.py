"""Fail closed unless Greek content review and the launch QA matrix are complete."""

from __future__ import annotations

from pathlib import Path

from scripts.greek.publish import validate_release_tree
from scripts.greek.stable_json import read_json

REQUIRED_LANGUAGES = ("en", "es", "he")


def validate_public_enablement(
    public_data_dir: Path,
    approvals_path: Path,
    qa_report_path: Path,
) -> dict:
    manifest = read_json(public_data_dir / "greek" / "manifest.json")
    release_dir = (
        public_data_dir
        / "greek"
        / "releases"
        / manifest["edition"]
        / manifest["revision"]
    )
    validate_release_tree(release_dir, manifest)
    lexicon = read_json(release_dir / "lexicon.json")
    failures: list[str] = []
    for strong, entry in lexicon.items():
        definitions = entry.get("definitions", {})
        for language in REQUIRED_LANGUAGES:
            definition = definitions.get(language, {})
            if definition.get("review_status") != "approved":
                failures.append(f"{strong}:{language}:not-approved")
            if not definition.get("short") or not definition.get("fuller"):
                failures.append(f"{strong}:{language}:incomplete")
    if failures:
        raise ValueError(
            "Greek definitions are not publishable: " + ", ".join(failures[:20])
        )

    approvals = read_json(approvals_path)
    if approvals.get("revision") != manifest["revision"]:
        raise ValueError("Reviewer approvals do not match the release revision")
    for language in ("es", "he"):
        approval = approvals.get("languages", {}).get(language, {})
        if (
            approval.get("status") != "approved"
            or not approval.get("reviewer")
            or not approval.get("approved_at")
        ):
            raise ValueError(f"Missing human reviewer approval for {language}")

    qa_report = read_json(qa_report_path)
    if qa_report.get("revision") != manifest["revision"]:
        raise ValueError("QA report does not match the release revision")
    cases = qa_report.get("cases", [])
    if not cases or any(case.get("status") != "passed" for case in cases):
        raise ValueError("The Greek launch QA matrix has not fully passed")

    return {
        "approved_definition_count": len(lexicon),
        "qa_case_count": len(cases),
        "revision": manifest["revision"],
    }
