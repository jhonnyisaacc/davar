"""Versioned disposition ledger for the Besorah remediation review queue (issue #159)."""
from __future__ import annotations

import gzip
import json
from collections import Counter
from pathlib import Path
from typing import Any, Callable

from scripts.delitzsch.review.remediate import REPORTS, ROOT, digest, encoded
from scripts.delitzsch.review.workflow import load_latest_decisions

SCHEMA_VERSION = 1
METHOD = "besorah_dispositions_v1"
REPORT = REPORTS / "besorah_remediation_v1.json.gz"
LEDGER = REPORTS / "besorah_dispositions_v1.json.gz"
DISPOSITIONS = ("benign", "corrected", "already_reviewed", "unresolved", "blocked", "superseded")
FAMILIES = {
    ("prefix_metadata_disagreement",): "prefix_metadata",
    ("lexical_plausibility",): "lexical_plausibility",
    ("prefix_metadata_disagreement", "lexical_plausibility"): "prefix_metadata_and_lexical",
}
DECISION_FIELDS = ("status", "action", "issue_type", "previous_strong", "new_strong", "confidence", "reason", "logged_at")

Record = dict[str, Any]
Verdict = tuple[str, str | None, dict[str, Any]]
Rule = tuple[str, int, Callable[[Record, dict[str, Any] | None], Verdict | None]]


def prior_review(entry: Record, decision: dict[str, Any] | None) -> Verdict | None:
    if entry["prior_review_status"] is None:
        return None
    if decision is None:
        raise ValueError(f"{entry['location']}: queue records a prior review but no decision log entry exists")
    return "already_reviewed", decision["reviewer"], {"prior_decision": {key: decision.get(key) for key in DECISION_FIELDS}}


def unadjudicated(entry: Record, decision: dict[str, Any] | None) -> Verdict:
    return "unresolved", None, {}


RULES: tuple[Rule, ...] = (
    ("prior_review_decision", 1, prior_review),
    ("unadjudicated", 1, unadjudicated),
)


def dispose(entry: Record, decision: dict[str, Any] | None) -> Record:
    family = FAMILIES[tuple(entry["reasons"])]
    for name, version, rule in RULES:
        if (verdict := rule(entry, decision)) is not None:
            break
    disposition, reviewer, evidence = verdict
    return dict(
        location=entry["location"], source="review_queue", family=family, reasons=entry["reasons"],
        disposition=disposition, rule=name, rule_version=version, reviewer=reviewer,
        before=dict(text=entry["text"], strong=entry["strong"]), after=None,
        evidence=dict(queue=entry["evidence"], **evidence),
    )


def build_ledger(queue: list[Record], decisions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    records = [dispose(entry, decisions.get(entry["location"])) for entry in queue]
    used = {r["location"]: decisions[r["location"]] for r in records if r["location"] in decisions}
    by_family: dict[str, Counter] = {family: Counter() for family in FAMILIES.values()}
    for record in records:
        by_family[record["family"]][record["disposition"]] += 1
    return dict(
        schema_version=SCHEMA_VERSION,
        method=METHOD,
        dispositions=list(DISPOSITIONS),
        inputs=dict(
            review_queue=dict(path=str(REPORT.relative_to(ROOT)), key="review_queue", sha256=digest(queue)),
            decisions=dict(path="data/delitzsch/review/decisions", sha256=digest(dict(sorted(used.items())))),
        ),
        summary=dict(
            total=len(records),
            by_disposition={d: sum(c[d] for c in by_family.values()) for d in DISPOSITIONS},
            by_family={family: {d: counts[d] for d in DISPOSITIONS} for family, counts in by_family.items()},
        ),
        records=records,
    )


def serialize(ledger: dict[str, Any]) -> bytes:
    return gzip.compress(encoded(ledger), mtime=0)


def build_from_disk(report: Path = REPORT, decisions_dir: Path = REPORTS.parent / "decisions") -> dict[str, Any]:
    queue = json.loads(gzip.decompress(report.read_bytes()))["review_queue"]
    return build_ledger(queue, load_latest_decisions(decisions_dir))


def read_ledger(path: Path = LEDGER) -> dict[str, Any]:
    return json.loads(gzip.decompress(path.read_bytes()))
