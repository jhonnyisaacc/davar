"""Lexicon root_ref adjudication pipeline.

Deterministic, script-first review of Hebrew lexicon root assignments.  The
pipeline audits ``data/dict/lexicon/words.json`` (every non-root entry and its
``root_ref``), scores each link with explainable heuristics, proposes keep /
change / reject actions, and separates lower-confidence decisions into a human
review queue.  Nothing is mutated on the lexicon until ``--apply`` is run on an
accepted set of decisions.

Confidence is deterministic: the same inputs always produce the same report (no
wall-clock timestamps, no randomness).  An optional ``ai_recommender`` callable
may be supplied to refine proposals, but the report stays deterministic when it
is absent.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from collections import Counter
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Callable
import re

# scripts/dict/adjudicate_roots.py -> project root (3 parents up).
PROJECT_ROOT = Path(__file__).parent.parent.parent
WORDS_PATH = PROJECT_ROOT / "data" / "dict" / "lexicon" / "words.json"
ROOTS_PATH = PROJECT_ROOT / "data" / "dict" / "lexicon" / "roots.json"
REPORT_DIR = PROJECT_ROOT / "data" / "dict" / "lexicon" / "adjudication"

HEBREW_LETTERS = set(range(0x05D0, 0x05EB))
FINAL_TO_REGULAR = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}
STRONG_RE = re.compile(r"[HGD](\d+)")


def normalize_hebrew(value: str) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFD", str(value))
    return "".join(
        FINAL_TO_REGULAR.get(char, char)
        for char in normalized
        if ord(char) in HEBREW_LETTERS
    )


def morph_similarity(a: str, b: str) -> float:
    """Orthographic similarity tolerant of derivation affixes.

    Returns 1.0 for identical (or exactly-affixed) forms and near 0.0 for
    unrelated stems.  Combines LCS ratio with a bonus when both surfaces share a
    derivational prefix core.
    """
    norm_a = normalize_hebrew(a)
    norm_b = normalize_hebrew(b)
    if not norm_a or not norm_b:
        return 0.0
    if norm_a == norm_b:
        return 1.0
    shorter, longer = sorted((norm_a, norm_b), key=len)
    ratio = SequenceMatcher(None, shorter, longer).ratio()
    core_bonus = 0.12 if norm_a[:2] == norm_b[:2] else 0.0
    return min(1.0, ratio + core_bonus)


def load_pair(
    words_path: Path = WORDS_PATH,
    roots_path: Path = ROOTS_PATH,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    words = json.loads(words_path.read_text(encoding="utf-8"))
    roots = json.loads(roots_path.read_text(encoding="utf-8"))
    return words, roots


def _upper_key(value: str) -> str:
    m = STRONG_RE.match(str(value))
    if m:
        return str(value).upper()
    return f"H{value}".upper()


def _entry_key(entry: dict[str, Any], fallback: str) -> str:
    return _upper_key(entry.get("strong_number") or fallback)


def build_root_index(roots: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for key, entry in roots.items():
        index[_entry_key(entry, key)] = entry
    return index


@dataclass
class Adjudication:
    strong: str
    lemma: str
    normalized: str
    current_root_ref: str
    root_lemma: str
    similarity: float
    proposal: str  # keep | change | reject
    proposed_root_ref: str | None
    confidence: float
    reason: str
    review_status: str  # auto_accepted | review


def audit(
    words: dict[str, dict[str, Any]],
    roots: dict[str, dict[str, Any]],
    *,
    keep_threshold: float = 0.5,
    ai_recommender: Callable[[Adjudication], Adjudication] | None = None,
) -> list[Adjudication]:
    """Adjudicate every non-root entry's ``root_ref``."""
    root_index = build_root_index(roots)

    # Precompute normalized root lemmas once (called thousands of times below).
    root_lemmas = {
        key: (normalize_hebrew(str((entry or {}).get("lemma") or "")), entry)
        for key, entry in root_index.items()
    }

    # Population per root, to avoid recommending over-used roots.
    child_counts: Counter[str] = Counter()
    for entry in words.values():
        rr = entry.get("root_ref")
        if rr:
            child_counts[_upper_key(rr)] += 1

    results: list[Adjudication] = []
    for strong_key, entry in words.items():
        if entry.get("is_root"):
            continue
        strong = _entry_key(entry, strong_key)
        current_root_ref = str(entry.get("root_ref") or "").upper()
        lemma = str(entry.get("lemma") or "")
        normalized = str(entry.get("normalized") or normalize_hebrew(lemma))

        if not current_root_ref:
            results.append(
                Adjudication(
                    strong=strong,
                    lemma=lemma,
                    normalized=normalized,
                    current_root_ref="",
                    root_lemma="",
                    similarity=0.0,
                    proposal="reject",
                    proposed_root_ref=None,
                    confidence=0.0,
                    reason="Non-root entry has no root_ref assigned.",
                    review_status="review",
                )
            )
            continue

        root_lemma = str((root_index.get(current_root_ref) or {}).get("lemma") or "")
        similarity = morph_similarity(normalized, root_lemma)

        if similarity >= keep_threshold:
            confidence = similarity
            reason = (
                f"Morphological and lexical evidence stays aligned with the "
                f"current derivation {current_root_ref} (similarity={similarity:.2f})."
            )
            proposal = "keep"
            proposed = current_root_ref
            review_status = "auto_accepted" if confidence >= 0.8 else "review"
        else:
            # Propose a closer root among those sharing the entry's first letter,
            # skipping already over-populated roots.  Limited to the putatively
            # related bucket to keep the audit O(n) in practice.
            candidate: str | None = None
            candidate_sim = similarity
            first_letter = normalized[:1] if normalized else ""
            for rkey, (rnorm, root_entry) in root_lemmas.items():
                if not rnorm or rnorm[:1] != first_letter:
                    continue
                if child_counts[_upper_key(rkey)] >= 15:
                    continue
                sim = morph_similarity(normalized, rnorm)
                if sim > candidate_sim:
                    candidate_sim = sim
                    candidate = _upper_key(rkey)
            if candidate:
                proposal = "change"
                proposed = candidate
                confidence = candidate_sim
                reason = (
                    f"Low agreement with current root {current_root_ref} "
                    f"(similarity={similarity:.2f}); closer root {candidate} "
                    f"(similarity={candidate_sim:.2f}) proposed."
                )
            else:
                proposal = "review"
                proposed = None
                confidence = similarity
                reason = (
                    f"Low agreement with current root {current_root_ref} "
                    f"(similarity={similarity:.2f}); no clearly better root found."
                )
            review_status = "review"

        adjud = Adjudication(
            strong=strong,
            lemma=lemma,
            normalized=normalized,
            current_root_ref=current_root_ref,
            root_lemma=root_lemma,
            similarity=similarity,
            proposal=proposal,
            proposed_root_ref=proposed,
            confidence=confidence,
            reason=reason,
            review_status=review_status,
        )

        if ai_recommender is not None:
            adjud = ai_recommender(adjud)
            adjud.review_status = "review" if adjud.confidence < 0.8 else "auto_accepted"

        results.append(adjud)

    return results

def audit_summary(adjudications: list[Adjudication]) -> dict[str, Any]:
    by_proposal: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for item in adjudications:
        by_proposal[item.proposal] = by_proposal.get(item.proposal, 0) + 1
        by_status[item.review_status] = by_status.get(item.review_status, 0) + 1
    return {
        "total": len(adjudications),
        "by_proposal": dict(sorted(by_proposal.items())),
        "by_review_status": dict(sorted(by_status.items())),
    }


def write_report(
    adjudications: list[Adjudication],
    output_path: Path,
    metadata: dict[str, Any] | None = None,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "summary": audit_summary(adjudications),
        "metadata": metadata or {},
        "entries": [asdict(item) for item in adjudications],
    }
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return output_path


def build_review_queue(adjudications: list[Adjudication]) -> list[dict[str, Any]]:
    return [
        {
            "strong": item.strong,
            "lemma": item.lemma,
            "current_root_ref": item.current_root_ref,
            "proposed_root_ref": item.proposed_root_ref,
            "similarity": round(item.similarity, 3),
            "reason": item.reason,
        }
        for item in adjudications
        if item.review_status == "review"
    ]


def apply_decisions(adjudications: list[Adjudication]) -> int:
    """Apply ``auto_accepted`` decisions to ``words.json`` (idempotent).

    Only entries whose review_status is ``auto_accepted`` are mutated.  "keep"
    means no change.  Returns the number of actual writes.
    """
    words = json.loads(WORDS_PATH.read_text(encoding="utf-8"))
    applied = 0
    for item in adjudications:
        if item.review_status != "auto_accepted":
            continue
        entry = words.get(item.strong)
        if entry is None:
            continue
        if item.proposal == "change" and item.proposed_root_ref:
            entry["root_ref"] = item.proposed_root_ref
            applied += 1
        elif item.proposal == "reject":
            entry.pop("root_ref", None)
            applied += 1
        # "keep" -> no write
    if applied:
        WORDS_PATH.write_text(
            json.dumps(words, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return applied


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        type=str,
        default=None,
        help="Output report JSON path (default data/dict/lexicon/adjudication/root_adjudication.json).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply auto_accepted decisions to words.json.",
    )
    parser.add_argument(
        "--keep-threshold",
        type=float,
        default=0.5,
        help="Similarity above which a link is kept (default 0.5).",
    )
    args = parser.parse_args()

    words, roots = load_pair()
    adjudications = audit(words, roots, keep_threshold=args.keep_threshold)
    summary = audit_summary(adjudications)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    report_path = Path(args.report) if args.report else REPORT_DIR / "root_adjudication.json"
    write_report(adjudications, report_path, metadata={"comment": "no mutation unless --apply"})
    print(f"Report written to {report_path}")

    if args.apply:
        applied = apply_decisions(adjudications)
        print(f"Applied {applied} auto_accepted decisions to {WORDS_PATH}.")
        print("WARNING: re-run the lexicon build and validator after applying changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())