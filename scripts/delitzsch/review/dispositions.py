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
    FINAL_TO_REGULAR,
    HEBREW_LETTERS,
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
PREFIX_ONLY = ["prefix_metadata_disagreement"]
PREPOSITIONS = {"Hb", "Hl", "Hk"}
REDUCED_VOWELS = set("\u05b0\u05b1\u05b2\u05b3")
PATAH, QAMETS, SEGOL, DAGESH = "\u05b7", "\u05b8", "\u05b6", "\u05bc"

Record = dict[str, Any]


class Verdict(NamedTuple):
    disposition: str
    reviewer: str | None
    evidence: dict[str, Any]
    before: dict[str, Any] = {}
    after: dict[str, Any] | None = None
    lexical_review: str | None = None


class Reading(NamedTuple):
    prefixes: list[str]
    lemma: str | None
    lemma_is_root: bool = False
    prefix_as_root: bool = False


Rule = tuple[str, int, Callable[[Record, dict[str, Any] | None, Reading | None], Verdict | None]]


def real_prefix_count(consonants: str, prefixes: list[str], lemma: str) -> int | None:
    for count in range(len(prefixes), -1, -1):
        letters = "".join(PREFIX_LETTERS[prefix] for prefix in prefixes[:count])
        if consonants.startswith(letters) and consonants[len(letters):].startswith(lemma[:2]):
            return count
    return None


def letter_marks(text: str) -> list[tuple[str, set[str]]]:
    letters: list[tuple[str, set[str]]] = []
    for char in text:
        if ord(char) in HEBREW_LETTERS:
            letters.append((FINAL_TO_REGULAR.get(char, char), set()))
        elif letters:
            letters[-1][1].add(char)
    return letters


def article_shaped(text: str, prefixes: list[str], lemma_is_root: bool) -> bool:
    position = prefixes.index("Hd")
    letters = letter_marks(text)
    if PREPOSITIONS & set(prefixes[:position]) or position + 1 >= len(letters):
        return False
    vowels, (following, marks) = letters[position][1], letters[position + 1]
    if PATAH in vowels and DAGESH in marks:
        return True
    reduced = bool(marks & REDUCED_VOWELS)
    if reduced and lemma_is_root:
        return False
    if PATAH in vowels:
        return following in "חה" or (reduced and following in "ימ")
    if QAMETS in vowels:
        return following in "אער"
    return SEGOL in vowels and following in "חעה" and QAMETS in marks


def reads_prefix_as_root(consonants: str, prefix_count: int, lemma: str, lemmas: frozenset[str]) -> bool:
    claimed = len(lemma) if consonants[prefix_count:].startswith(lemma) else 2
    shortest = claimed if claimed >= 4 else claimed + 1
    return any(
        consonants[start:start + length] in lemmas
        for start in range(prefix_count)
        for length in range(shortest, len(consonants) - start + 1)
    )


def root_letter_prefixes(text: str, prefixes: list[str], lemma: str | None) -> list[str] | None:
    count = real_prefix_count(normalize_hebrew(text), prefixes, lemma) if lemma else None
    return None if count is None or count == len(prefixes) else prefixes[:count]


def root_letter_correction(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict | None:
    if decision is None or decision.get("issue_type") != ROOT_LETTER_ISSUE or decision["status"] not in STRONG_CONFIRMED:
        return None
    occurrence = decision["occurrence"]
    strong_review = decision.get("evidence", {}).get("strong_review") or {}
    if (
        entry["prior_review_status"] not in STRONG_CONFIRMED
        or strong_review.get("new_strong") != entry["strong"]
        or not decision["previous_strong"] == decision["new_strong"] == occurrence["strong"] == entry["strong"]
        or root_letter_prefixes(occurrence["text"], occurrence["prefixes"], reading and reading.lemma) != decision["new_prefixes"]
    ):
        raise ValueError(f"{entry['location']}: root-letter decision does not satisfy the root-letter rule")
    return Verdict(
        "corrected", decision["reviewer"], dict(decision["evidence"], status=decision["status"], logged_at=decision["logged_at"]),
        before=dict(prefixes=occurrence["prefixes"]),
        after=dict(text=occurrence["text"], strong=decision["new_strong"], prefixes=decision["new_prefixes"]),
    )


def style_only_prefix(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict | None:
    if reading is None or not reading.prefixes or len(reading.lemma or "") < 3 or entry["prior_review_status"] not in (None, *STRONG_CONFIRMED):
        return None
    consonants = normalize_hebrew(entry["text"])
    stem_length = len(consonants) - len(reading.prefixes)
    if stem_length < len(reading.lemma) or real_prefix_count(consonants, reading.prefixes, reading.lemma) != len(reading.prefixes):
        return None
    strong_reviewed = decision is not None and decision["status"] in STRONG_CONFIRMED and decision.get("new_strong") == entry["strong"]
    if "Hd" in reading.prefixes and not article_shaped(entry["text"], reading.prefixes, reading.lemma_is_root):
        return None
    if not strong_reviewed and (reading.prefix_as_root or not consonants[len(reading.prefixes):].startswith(normalize_hebrew(reading.lemma)[:3])):
        return None
    return Verdict("benign", "rule:style_only_prefix_v5", dict(
        consonants=consonants, prefixes=reading.prefixes,
        prefix_letters="".join(PREFIX_LETTERS[p] for p in reading.prefixes), lemma=reading.lemma,
        prior_decision=decision and {key: decision.get(key) for key in DECISION_FIELDS},
    ), lexical_review="reviewed" if strong_reviewed else "pending")


def prior_review(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict | None:
    if entry["prior_review_status"] is None:
        return None
    if decision is None:
        raise ValueError(f"{entry['location']}: queue records a prior review but no decision log entry exists")
    return Verdict("already_reviewed", decision["reviewer"], {"prior_decision": {key: decision.get(key) for key in DECISION_FIELDS}})


def unadjudicated(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict:
    return Verdict("unresolved", None, {})


RULES: tuple[Rule, ...] = (
    ("root_letter_prefix", 1, root_letter_correction),
    ("style_only_prefix", 5, style_only_prefix),
    ("prior_review_decision", 1, prior_review),
    ("unadjudicated", 1, unadjudicated),
)


def dispose(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Record:
    family = FAMILIES[tuple(entry["reasons"])]
    for name, version, rule in RULES:
        if (verdict := rule(entry, decision, reading)) is not None:
            break
    record = dict(
        location=entry["location"], source="review_queue", family=family, reasons=entry["reasons"],
        disposition=verdict.disposition, rule=name, rule_version=version, reviewer=verdict.reviewer,
        before=dict(text=entry["text"], strong=entry["strong"], **verdict.before), after=verdict.after,
        evidence=dict(queue=entry["evidence"], **verdict.evidence),
    )
    if verdict.lexical_review is not None:
        record["lexical_review"] = verdict.lexical_review
    return record


def build_ledger(queue: list[Record], decisions: dict[str, dict[str, Any]], readings: dict[str, Reading] | None = None) -> dict[str, Any]:
    readings = readings or {}
    records = [dispose(entry, decisions.get(entry["location"]), readings.get(entry["location"])) for entry in queue]
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
            prefix_readings=dict(paths=["data/delitzsch/parsed", "data/dict/lexicon"], sha256=digest(dict(sorted(readings.items())))),
        ),
        summary=dict(
            total=len(records),
            by_disposition={d: sum(c[d] for c in by_family.values()) for d in DISPOSITIONS},
            by_family={family: {d: counts[d] for d in DISPOSITIONS} for family, counts in by_family.items()},
            benign_lexical_review={status: sum(r.get("lexical_review") == status for r in records) for status in ("pending", "reviewed")},
        ),
        records=records,
    )


def serialize(ledger: dict[str, Any]) -> bytes:
    return gzip.compress(encoded(ledger), mtime=0)


def build_from_disk(report: Path = REPORT, decisions_dir: Path = REPORTS.parent / "decisions") -> dict[str, Any]:
    queue = json.loads(gzip.decompress(report.read_bytes()))["review_queue"]
    return build_ledger(queue, load_latest_decisions(decisions_dir), prefix_readings(queue, load_corpus(), LexiconIndex(ROOT / "data/dict/lexicon/words")))


def lexicon_lemmas(lexicon: LexiconIndex) -> frozenset[str]:
    paths = (*lexicon.lexicon_words_dir.glob("H*.json"), *lexicon.lexicon_roots_dir.glob("H*.json"))
    lemmas = (lexicon.normalized_lemma(path.stem) for path in paths)
    return frozenset(normalize_hebrew(lemma) for lemma in lemmas if lemma and len(lemma) >= 3)


def prefix_readings(queue: list[Record], corpus: dict[str, Any], lexicon: LexiconIndex) -> dict[str, Reading]:
    by_location = {key: word for _, _, _, word, key in words(corpus)}
    lemmas = lexicon_lemmas(lexicon)
    readings = {}
    for entry in queue:
        if entry["reasons"] != PREFIX_ONLY:
            continue
        prefixes = by_location[entry["location"]].get("prefixes") or []
        lemma = lexicon.normalized_lemma(entry["strong"])
        consonants = normalize_hebrew(entry["text"])
        as_root = bool(lemma) and reads_prefix_as_root(consonants, len(prefixes), normalize_hebrew(lemma), lemmas)
        is_root = bool((lexicon.get(entry["strong"]) or {}).get("is_root"))
        readings[entry["location"]] = Reading(prefixes, lemma, is_root, as_root)
    return readings


def read_ledger(path: Path = LEDGER) -> dict[str, Any]:
    return json.loads(gzip.decompress(path.read_bytes()))


def root_letter_decision(entry: Record, word: Record, decision: dict[str, Any] | None, lemma: str | None) -> Record | None:
    if decision is not None and decision.get("issue_type") == ROOT_LETTER_ISSUE:
        return {key: value for key, value in decision.items() if key not in ("status", "logged_at")}
    prefixes = word.get("prefixes") or []
    consonants = normalize_hebrew(word["text"])
    new_prefixes = root_letter_prefixes(word["text"], prefixes, lemma)
    if new_prefixes is None:
        return None
    if decision is None or decision["status"] not in STRONG_CONFIRMED or decision.get("new_strong") != entry["strong"]:
        return None
    book, chapter_number, verse, index = entry["location"].split(".")
    return dict(
        action="set_strong", issue_type=ROOT_LETTER_ISSUE, reviewer="rule:root_letter_prefix_v1", confidence=0.95,
        occurrence=dict(book=book, chapter=int(chapter_number), verse=int(verse), word_index=int(index),
                        text=word["text"], strong=entry["strong"], prefixes=prefixes),
        previous_strong=entry["strong"], new_strong=entry["strong"], new_prefixes=new_prefixes,
        reason=f"The tagged prefix letters {''.join(PREFIX_LETTERS[p] for p in prefixes[len(new_prefixes):])} begin the lemma {lemma} of the reviewed Strong {entry['strong']}, so they are root letters, not prefixes.",
        evidence=dict(consonants=consonants, prefix_letters="".join(PREFIX_LETTERS[p] for p in prefixes), lemma=lemma,
                      strong_review={key: decision.get(key) for key in ("reviewer", "status", "new_strong", "reason", "logged_at")}),
    )


def root_letter_batch(queue: list[Record], corpus: dict[str, Any], decisions: dict[str, dict[str, Any]], lexicon: LexiconIndex) -> dict[str, Any]:
    by_location = {key: word for _, _, _, word, key in words(corpus)}
    proposals = []
    for entry in queue:
        if entry["reasons"] != PREFIX_ONLY:
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
        rebuilt = copy.deepcopy(verse)
        _refresh_verse_prefix_separators([rebuilt], {"verse": verse["verse"]})
        if rebuilt["hebrew"] != verse["hebrew"]:
            raise ValueError(f"{record['location']}: verse separators differ from the ones its words produce")
        word["prefixes"] = record["before"]["prefixes"]
        _refresh_verse_prefix_separators(chapter(reverted[path])["verses"], {"verse": verse["verse"]})
    return reverted


def revert_file(path: str, payload: Any, records: list[Record]) -> Any:
    keys = {key for *_, key in words({path: payload})}
    return revert_corrections({path: payload}, [r for r in records if r["location"] in keys])[path]
