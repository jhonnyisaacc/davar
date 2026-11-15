"""Versioned disposition ledger for the Besorah remediation review queue (issue #159)."""
from __future__ import annotations

import copy
import gzip
import json
from collections import Counter
from pathlib import Path
from typing import Any, Callable, NamedTuple

from scripts.delitzsch.review.remediate import REPORTS, ROOT, chapter, digest, encoded, load_corpus, words
from scripts.delitzsch.review.workflow import (
    LexiconIndex,
    _refresh_verse_prefix_separators,
    load_latest_decisions,
    normalize_hebrew,
)

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
PREFIX_LETTERS = {"Hb": "ב", "Hl": "ל", "Hk": "כ", "Hc": "ו", "Hd": "ה", "Hm": "מ"}
ROOT_LETTER_ISSUE = "root_letter_prefix"
ROOT_LETTER_BATCH = REPORTS.parent / "batches" / "root_letter_prefixes.json"
STRONG_CONFIRMED = {"applied", "already_applied"}

Record = dict[str, Any]


class Verdict(NamedTuple):
    disposition: str
    reviewer: str | None
    evidence: dict[str, Any]
    before: dict[str, Any] = {}
    after: dict[str, Any] | None = None


Rule = tuple[str, int, Callable[[Record, dict[str, Any] | None], Verdict | None]]


def real_prefix_count(consonants: str, prefixes: list[str], lemma: str) -> int | None:
    for count in range(len(prefixes), -1, -1):
        letters = "".join(PREFIX_LETTERS[prefix] for prefix in prefixes[:count])
        if consonants.startswith(letters) and consonants[len(letters):].startswith(lemma[:2]):
            return count
    return None


def root_letter_correction(entry: Record, decision: dict[str, Any] | None) -> Verdict | None:
    if decision is None or decision.get("issue_type") != ROOT_LETTER_ISSUE or decision["status"] not in STRONG_CONFIRMED:
        return None
    occurrence = decision["occurrence"]
    return Verdict(
        "corrected", decision["reviewer"], dict(decision["evidence"], status=decision["status"], logged_at=decision["logged_at"]),
        before=dict(prefixes=occurrence["prefixes"]),
        after=dict(text=occurrence["text"], strong=decision["new_strong"], prefixes=decision["new_prefixes"]),
    )


def prior_review(entry: Record, decision: dict[str, Any] | None) -> Verdict | None:
    if entry["prior_review_status"] is None:
        return None
    if decision is None:
        raise ValueError(f"{entry['location']}: queue records a prior review but no decision log entry exists")
    return Verdict("already_reviewed", decision["reviewer"], {"prior_decision": {key: decision.get(key) for key in DECISION_FIELDS}})


def unadjudicated(entry: Record, decision: dict[str, Any] | None) -> Verdict:
    return Verdict("unresolved", None, {})


RULES: tuple[Rule, ...] = (
    ("root_letter_prefix", 1, root_letter_correction),
    ("prior_review_decision", 1, prior_review),
    ("unadjudicated", 1, unadjudicated),
)


def dispose(entry: Record, decision: dict[str, Any] | None) -> Record:
    family = FAMILIES[tuple(entry["reasons"])]
    for name, version, rule in RULES:
        if (verdict := rule(entry, decision)) is not None:
            break
    return dict(
        location=entry["location"], source="review_queue", family=family, reasons=entry["reasons"],
        disposition=verdict.disposition, rule=name, rule_version=version, reviewer=verdict.reviewer,
        before=dict(text=entry["text"], strong=entry["strong"], **verdict.before), after=verdict.after,
        evidence=dict(queue=entry["evidence"], **verdict.evidence),
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


def root_letter_decision(entry: Record, word: Record, decision: dict[str, Any] | None, lemma: str | None) -> Record | None:
    if decision is not None and decision.get("issue_type") == ROOT_LETTER_ISSUE:
        return {key: value for key, value in decision.items() if key not in ("status", "logged_at")}
    prefixes = word.get("prefixes") or []
    consonants = normalize_hebrew(word["text"])
    count = real_prefix_count(consonants, prefixes, lemma) if lemma else None
    if count is None or count == len(prefixes):
        return None
    if decision is None or decision["status"] not in STRONG_CONFIRMED or decision.get("new_strong") != entry["strong"]:
        return None
    book, chapter_number, verse, index = entry["location"].split(".")
    return dict(
        action="set_strong", issue_type=ROOT_LETTER_ISSUE, reviewer="rule:root_letter_prefix_v1", confidence=0.95,
        occurrence=dict(book=book, chapter=int(chapter_number), verse=int(verse), word_index=int(index),
                        text=word["text"], strong=entry["strong"], prefixes=prefixes),
        previous_strong=entry["strong"], new_strong=entry["strong"], new_prefixes=prefixes[:count],
        reason=f"The tagged prefix letters {''.join(PREFIX_LETTERS[p] for p in prefixes[count:])} begin the lemma {lemma} of the reviewed Strong {entry['strong']}, so they are root letters, not prefixes.",
        evidence=dict(consonants=consonants, prefix_letters="".join(PREFIX_LETTERS[p] for p in prefixes), lemma=lemma,
                      strong_review={key: decision.get(key) for key in ("reviewer", "status", "new_strong", "reason", "logged_at")}),
    )


def root_letter_batch(queue: list[Record], corpus: dict[str, Any], decisions: dict[str, dict[str, Any]], lexicon: LexiconIndex) -> dict[str, Any]:
    by_location = {key: word for _, _, _, word, key in words(corpus)}
    proposals = []
    for entry in queue:
        if entry["reasons"] != ["prefix_metadata_disagreement"]:
            continue
        proposal = root_letter_decision(entry, by_location[entry["location"]], decisions.get(entry["location"]), lexicon.normalized_lemma(entry["strong"]))
        if proposal is not None:
            proposals.append(proposal)
    return dict(issue=366, rule="root_letter_prefix", rule_version=1, decisions=proposals)


def root_letter_batch_from_disk() -> dict[str, Any]:
    queue = json.loads(gzip.decompress(REPORT.read_bytes()))["review_queue"]
    lexicon = LexiconIndex(ROOT / "data/dict/lexicon/words")
    return root_letter_batch(queue, load_corpus(), load_latest_decisions(REPORTS.parent / "decisions"), lexicon)


def revert_corrections(corpus: dict[str, Any], records: list[Record]) -> dict[str, Any]:
    reverted = copy.deepcopy(corpus)
    index = {key: (path, verse, word) for path, verse, _, word, key in words(reverted)}
    for record in records:
        if record["disposition"] != "corrected":
            continue
        path, verse, word = index[record["location"]]
        if word.get("prefixes", []) != record["after"]["prefixes"]:
            raise ValueError(f"{record['location']}: corpus prefixes differ from the corrected ledger value")
        word["prefixes"] = record["before"]["prefixes"]
        _refresh_verse_prefix_separators(chapter(reverted[path])["verses"], {"verse": verse["verse"]})
    return reverted
