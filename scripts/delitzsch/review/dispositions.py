"""Versioned disposition ledger for the Besorah remediation review queue (issue #159)."""
from __future__ import annotations

import copy
import gzip
import json
from collections import Counter
from pathlib import Path
from typing import Any, Callable, NamedTuple

from scripts.delitzsch.review.remediate import REPORTS, ROOT, chapter, digest, encoded, load_corpus, pointed, words
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
    (): "outside_queue",
}
LEGACY_SOURCE = "legacy_assignment_review"
DECISION_SOURCE = "decision_log"
LEGACY_FAMILY = "legacy_assignment"
DECISION_FIELDS = ("status", "action", "issue_type", "previous_strong", "new_strong", "confidence", "reason", "logged_at")
PREFIX_LETTERS = {"Hb": "ב", "Hl": "ל", "Hk": "כ", "Hc": "ו", "Hd": "ה", "Hm": "מ"}
ROOT_LETTER_ISSUE = "root_letter_prefix"
WITHDRAWN_ROOT_LETTER_ISSUE = "root_letter_prefix_withdrawn"
STRONG_ISSUE = "strong_correction"
LEXICAL_ISSUE = "lexical_review"
OUTSIDE_QUEUE_ISSUES = {STRONG_ISSUE, ROOT_LETTER_ISSUE, LEXICAL_ISSUE}
EVIDENCE_KEYS = ("lexicon", "grammar", "context")
ROOT_LETTER_BATCH = REPORTS.parent / "batches" / "root_letter_prefixes.json"
OUTSIDE_ROOT_LETTER_BATCH = REPORTS.parent / "batches" / "root_letter_prefixes_outside_queue.json"
OUTSIDE_ROOT_LETTER_REVIEWER = "rule:root_letter_prefix_outside_queue_v1"
STRONG_CONFIRMED = {"applied", "already_applied"}
STRONG_REVIEWED = {*STRONG_CONFIRMED, "skipped"}
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


class RootLetter(NamedTuple):
    new_prefixes: list[str]
    basis: str
    certain: bool


class Reading(NamedTuple):
    prefixes: list[str]
    lemma: str | None
    lemma_is_root: bool = False
    prefix_as_root: bool = False
    root_letter: RootLetter | None = None


class Match(NamedTuple):
    location: str
    word: Record | None
    decision: dict[str, Any] | None


Rule = tuple[str, int, Callable[[Record, dict[str, Any] | None, Reading | None], Verdict | None]]
LegacyRule = tuple[str, int, Callable[[Record, list[Match]], Verdict | None]]


def prefix_letters(prefixes: list[str]) -> str:
    return "".join(PREFIX_LETTERS[prefix] for prefix in prefixes)


def real_prefix_count(consonants: str, prefixes: list[str], lemma: str) -> int | None:
    for count in range(len(prefixes), -1, -1):
        letters = prefix_letters(prefixes[:count])
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


def outside_root_letter(text: str, prefixes: list[str], strong: str, lemma: str | None, is_root: bool,
                        lemmas: frozenset[str], review: dict[str, Any] | None) -> RootLetter | None:
    new_prefixes = root_letter_prefixes(text, prefixes, lemma)
    if new_prefixes is None:
        return None
    if review is not None and review["status"] in STRONG_REVIEWED and (review.get("new_strong") or "").split("/")[-1] == strong.split("/")[-1]:
        return RootLetter(new_prefixes, "reviewed_strong", True)
    consonants = normalize_hebrew(text)
    kept = consonants[len(prefix_letters(new_prefixes)):]
    stems = [consonants[len(prefix_letters(prefixes[:count])):] for count in range(len(new_prefixes) + 1, len(prefixes) + 1)]
    if review is not None and review["status"] == "needs_manual_review":
        reason = "manual_review"
    elif len(lemma) < 3:
        reason = "short_lemma"
    elif not kept.startswith(lemma):
        reason = "lemma_not_in_word"
    elif any(stem in lemmas or any(stem[:length] in lemmas for length in range(3, len(stem))) for stem in stems):
        reason = "prefix_reading"
    elif "Hd" in prefixes[len(new_prefixes):] and article_shaped(text, prefixes, is_root):
        reason = "article_shape"
    else:
        return RootLetter(new_prefixes, "lemma_check", True)
    return RootLetter(new_prefixes, reason, False)


def root_letter_correction(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict | None:
    if decision is None or decision.get("issue_type") != ROOT_LETTER_ISSUE or decision["status"] not in STRONG_CONFIRMED:
        return None
    if entry.get("source") == DECISION_SOURCE:
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


def outside_root_letter_correction(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict | None:
    if entry.get("source") != DECISION_SOURCE or decision is None or decision.get("issue_type") != ROOT_LETTER_ISSUE:
        return None
    occurrence, found = decision["occurrence"], reading and reading.root_letter
    if (
        decision["status"] not in STRONG_CONFIRMED
        or not found
        or not found.certain
        or not decision["previous_strong"] == occurrence["strong"] == entry["strong"]
        or decision["new_prefixes"] != found.new_prefixes
        or decision["evidence"]["basis"] != found.basis
        or decision["new_strong"] != "/".join([*found.new_prefixes, entry["strong"].split("/")[-1]])
    ):
        raise ValueError(f"{entry['location']}: root-letter decision does not satisfy the outside-queue root-letter rule")
    return Verdict(
        "corrected", decision["reviewer"], dict(decision["evidence"], status=decision["status"], logged_at=decision["logged_at"]),
        before=dict(prefixes=occurrence["prefixes"]),
        after=dict(text=occurrence["text"], strong=decision["new_strong"], prefixes=decision["new_prefixes"]),
    )


def reviewed_evidence(decision: dict[str, Any]) -> bool:
    return not decision["reviewer"].startswith("rule:") and all(decision.get("evidence", {}).get(key) for key in EVIDENCE_KEYS)


def reviewed_strong_correction(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict | None:
    if decision is None or decision.get("issue_type") not in (STRONG_ISSUE, LEXICAL_ISSUE):
        return None
    if decision["issue_type"] == LEXICAL_ISSUE and decision.get("action") != "set_strong":
        return None
    occurrence, new_strong = decision["occurrence"], decision["new_strong"]
    prefixes = occurrence["prefixes"]
    new_prefixes = decision.get("new_prefixes", prefixes) if decision["issue_type"] == LEXICAL_ISSUE else prefixes
    if (
        decision["status"] not in STRONG_CONFIRMED
        or decision["action"] != "set_strong"
        or (decision["issue_type"] == STRONG_ISSUE and "new_prefixes" in decision)
        or occurrence["text"] != entry["text"]
        or not decision["previous_strong"] == occurrence["strong"] == entry["strong"]
        or (new_strong.split("/")[-1], new_prefixes) == (entry["strong"].split("/")[-1], prefixes)
        or new_strong.split("/")[:-1] != new_prefixes
        or not normalize_hebrew(entry["text"]).startswith(prefix_letters(new_prefixes))
        or not decision.get("reason")
        or not reviewed_evidence(decision)
    ):
        raise ValueError(f"{entry['location']}: Strong correction does not satisfy the reviewed Strong correction rule")
    return Verdict(
        "corrected", decision["reviewer"],
        dict(decision["evidence"], reason=decision["reason"], status=decision["status"], logged_at=decision["logged_at"]),
        before=dict(prefixes=prefixes),
        after=dict(text=occurrence["text"], strong=new_strong, prefixes=new_prefixes),
    )


def lexical_review(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Verdict | None:
    if decision is None or decision.get("issue_type") != LEXICAL_ISSUE or decision.get("action") == "set_strong":
        return None
    occurrence = decision["occurrence"]
    kept = decision["action"] == "skip" and decision["status"] == "skipped" and decision["new_strong"] == entry["strong"]
    blocked = decision["action"] == "needs_manual_review" and decision["status"] == "needs_manual_review"
    if (
        not (kept or blocked)
        or "new_prefixes" in decision
        or occurrence["text"] != entry["text"]
        or not decision["previous_strong"] == occurrence["strong"] == entry["strong"]
        or not decision.get("reason")
        or not reviewed_evidence(decision)
    ):
        raise ValueError(f"{entry['location']}: lexical review does not satisfy the lexical review rule")
    evidence = dict(decision["evidence"], reason=decision["reason"], status=decision["status"], logged_at=decision["logged_at"])
    if blocked:
        return Verdict("blocked", decision["reviewer"], evidence)
    return Verdict("benign", decision["reviewer"], evidence, before=dict(prefixes=occurrence["prefixes"]), lexical_review="reviewed")


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
        prefix_letters=prefix_letters(reading.prefixes), lemma=reading.lemma,
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
    ("root_letter_prefix_outside_queue", 1, outside_root_letter_correction),
    ("reviewed_strong_correction", 2, reviewed_strong_correction),
    ("lexical_review", 1, lexical_review),
    ("style_only_prefix", 5, style_only_prefix),
    ("prior_review_decision", 1, prior_review),
    ("unadjudicated", 1, unadjudicated),
)


def current_state(match: Match) -> dict[str, Any]:
    word = match.word or {}
    return dict(location=match.location, text=word.get("text"), strong=word.get("strong"),
                review_status=match.decision and match.decision["status"])


def legacy_without_candidate(row: Record, matches: list[Match]) -> Verdict | None:
    if row["candidate"] is not None:
        return None
    return Verdict("superseded", "rule:legacy_without_candidate_v1", dict(matching_locations=row["matching_locations"]))


def legacy_current_value(row: Record, matches: list[Match]) -> Verdict | None:
    if len(matches) != 1 or matches[0].word is None:
        return None
    [match] = matches
    if pointed(match.word["text"]) != pointed(row["text"]) or match.word.get("strong") != row["candidate"]:
        return None
    return Verdict("superseded", "rule:legacy_current_value_v1",
                   dict(matching_locations=row["matching_locations"], current=[current_state(match)]),
                   after=dict(location=match.location, strong=match.word["strong"]))


def legacy_blocked(row: Record, matches: list[Match]) -> Verdict:
    return Verdict("blocked", None, dict(matching_locations=row["matching_locations"], current=[current_state(m) for m in matches]))


LEGACY_RULES: tuple[LegacyRule, ...] = (
    ("legacy_without_candidate", 1, legacy_without_candidate),
    ("legacy_current_value", 1, legacy_current_value),
    ("legacy_blocked", 1, legacy_blocked),
)


def dispose_legacy(index: int, row: Record, matches: list[Match]) -> Record:
    for name, version, rule in LEGACY_RULES:
        if (verdict := rule(row, matches)) is not None:
            break
    return dict(
        location=None, source=LEGACY_SOURCE, row=index, family=LEGACY_FAMILY,
        disposition=verdict.disposition, rule=name, rule_version=version, reviewer=verdict.reviewer,
        before={key: row[key] for key in ("book", "chapter", "word_index", "text", "candidate", "outcome")}, after=verdict.after,
        evidence=dict(queue=row["reason"], **verdict.evidence),
    )


def legacy_matches(rows: list[Record], corpus: dict[str, Any], decisions: dict[str, dict[str, Any]]) -> list[list[Match]]:
    by_location = {key: word for _, _, _, word, key in words(corpus)}
    return [[Match(loc, by_location.get(loc), decisions.get(loc)) for loc in row["matching_locations"]] for row in rows]


def outside_queue_entries(queue: list[Record], decisions: dict[str, dict[str, Any]]) -> list[Record]:
    queued = {entry["location"] for entry in queue}
    return [
        dict(location=location, source=DECISION_SOURCE, text=decision["occurrence"]["text"], strong=decision["occurrence"]["strong"],
             reasons=[], prior_review_status=None, evidence="not in review_queue")
        for location, decision in sorted(decisions.items())
        if location not in queued and decision.get("issue_type") in OUTSIDE_QUEUE_ISSUES
    ]


def dispose(entry: Record, decision: dict[str, Any] | None, reading: Reading | None) -> Record:
    family = FAMILIES[tuple(entry["reasons"])]
    for name, version, rule in RULES:
        if (verdict := rule(entry, decision, reading)) is not None:
            break
    record = dict(
        location=entry["location"], source=entry.get("source", "review_queue"), family=family, reasons=entry["reasons"],
        disposition=verdict.disposition, rule=name, rule_version=version, reviewer=verdict.reviewer,
        before=dict(text=entry["text"], strong=entry["strong"], **verdict.before), after=verdict.after,
        evidence=dict(queue=entry["evidence"], **verdict.evidence),
    )
    if verdict.lexical_review is not None:
        record["lexical_review"] = verdict.lexical_review
    return record


def build_ledger(
    queue: list[Record], decisions: dict[str, dict[str, Any]], readings: dict[str, Reading] | None = None,
    legacy: list[Record] = (), matches: list[list[Match]] = (),
) -> dict[str, Any]:
    readings = readings or {}
    outside = outside_queue_entries(queue, decisions)
    records = [dispose(entry, decisions.get(entry["location"]), readings.get(entry["location"])) for entry in (*queue, *outside)]
    records += [dispose_legacy(index, row, row_matches) for index, (row, row_matches) in enumerate(zip(legacy, matches, strict=True))]
    locations = {r["location"] for r in (*queue, *outside)} | {m.location for row_matches in matches for m in row_matches}
    used = {location: decisions[location] for location in locations if location in decisions}
    by_family: dict[str, Counter] = {family: Counter() for family in (*FAMILIES.values(), LEGACY_FAMILY)}
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
            legacy_assignment_review=dict(path=str(REPORT.relative_to(ROOT)), key=LEGACY_SOURCE, sha256=digest(list(legacy))),
        ),
        summary=dict(
            total=len(records),
            by_disposition={d: sum(c[d] for c in by_family.values()) for d in DISPOSITIONS},
            by_family={family: {d: counts[d] for d in DISPOSITIONS} for family, counts in by_family.items()},
            by_rule=dict(sorted(Counter(r["rule"] for r in records).items())),
            benign_lexical_review={status: sum(r.get("lexical_review") == status for r in records) for status in ("pending", "reviewed")},
        ),
        records=records,
    )


def serialize(ledger: dict[str, Any]) -> bytes:
    return gzip.compress(encoded(ledger), mtime=0)


def build_from_disk(report: Path = REPORT, decisions_dir: Path = REPORTS.parent / "decisions") -> dict[str, Any]:
    plan = json.loads(gzip.decompress(report.read_bytes()))
    queue, legacy = plan["review_queue"], plan[LEGACY_SOURCE]
    corpus, decisions = load_corpus(), load_latest_decisions(decisions_dir)
    lexicon = LexiconIndex(ROOT / "data/dict/lexicon/words")
    readings = prefix_readings(queue, corpus, lexicon)
    readings |= outside_readings(outside_queue_entries(queue, decisions), decisions, strong_reviews(decisions_dir), lexicon)
    return build_ledger(queue, decisions, readings, legacy, legacy_matches(legacy, corpus, decisions))


def strong_reviews(decisions_dir: Path = REPORTS.parent / "decisions") -> dict[str, dict[str, Any]]:
    return load_latest_decisions(decisions_dir, keep=lambda entry: entry.get("issue_type") not in {ROOT_LETTER_ISSUE, WITHDRAWN_ROOT_LETTER_ISSUE})


def outside_reading(word: Record, review: dict[str, Any] | None, lexicon: LexiconIndex, lemmas: frozenset[str]) -> Reading:
    prefixes, lemma = word.get("prefixes") or [], lexicon.normalized_lemma(word["strong"])
    is_root = bool((lexicon.get(word["strong"]) or {}).get("is_root"))
    found = outside_root_letter(word["text"], prefixes, word["strong"], lemma and normalize_hebrew(lemma), is_root, lemmas, review)
    return Reading(prefixes, lemma, is_root, root_letter=found)


def outside_readings(entries: list[Record], decisions: dict[str, dict[str, Any]], reviews: dict[str, dict[str, Any]],
                     lexicon: LexiconIndex) -> dict[str, Reading]:
    lemmas = lexicon_lemmas(lexicon)
    return {
        entry["location"]: outside_reading(decisions[entry["location"]]["occurrence"], reviews.get(entry["location"]), lexicon, lemmas)
        for entry in entries
        if decisions[entry["location"]].get("issue_type") == ROOT_LETTER_ISSUE
    }


def lexicon_lemmas(lexicon: LexiconIndex) -> frozenset[str]:
    paths = (*lexicon.lexicon_words_dir.glob("H*.json"), *lexicon.lexicon_roots_dir.glob("H*.json"))
    lemmas = (lexicon.normalized_lemma(path.stem) for path in paths)
    return frozenset(normalize_hebrew(lemma) for lemma in lemmas if lemma and len(lemma) >= 2)


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
        reason=f"The tagged prefix letters {prefix_letters(prefixes[len(new_prefixes):])} begin the lemma {lemma} of the reviewed Strong {entry['strong']}, so they are root letters, not prefixes.",
        evidence=dict(consonants=consonants, prefix_letters=prefix_letters(prefixes), lemma=lemma,
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


def outside_root_letter_decision(location: str, word: Record, reading: Reading, review: dict[str, Any] | None) -> Record:
    book, chapter_number, verse, index = location.split(".")
    strong, found = word["strong"], reading.root_letter
    base = strong.split("/")[-1]
    return dict(
        action="set_strong", issue_type=ROOT_LETTER_ISSUE, reviewer=OUTSIDE_ROOT_LETTER_REVIEWER, confidence=0.95,
        occurrence=dict(book=book, chapter=int(chapter_number), verse=int(verse), word_index=int(index),
                        text=word["text"], strong=strong, prefixes=word["prefixes"]),
        previous_strong=strong, new_strong="/".join([*found.new_prefixes, base]), new_prefixes=found.new_prefixes,
        reason=f"The tagged prefix letters {prefix_letters(word['prefixes'][len(found.new_prefixes):])} begin the lemma {reading.lemma} of {base}, so they are root letters, not prefixes.",
        evidence=dict(basis=found.basis, consonants=normalize_hebrew(word["text"]), prefix_letters=prefix_letters(word["prefixes"]), lemma=reading.lemma,
                      strong_review=review and {key: review.get(key) for key in ("reviewer", "status", "new_strong", "reason", "logged_at")}),
    )


def withdrawn_root_letter_decision(location: str, word: Record, decision: dict[str, Any], reading: Reading) -> Record:
    book, chapter_number, verse, index = location.split(".")
    return dict(
        action="set_strong", issue_type=WITHDRAWN_ROOT_LETTER_ISSUE, reviewer=OUTSIDE_ROOT_LETTER_REVIEWER, confidence=0.95,
        occurrence=dict(book=book, chapter=int(chapter_number), verse=int(verse), word_index=int(index),
                        text=word["text"], strong=word["strong"], prefixes=word.get("prefixes") or []),
        previous_strong=word["strong"], new_strong=decision["previous_strong"], new_prefixes=decision["occurrence"]["prefixes"],
        reason=f"The root-letter rule no longer finds the match certain ({reading.root_letter.basis}), so the correction logged at {decision['logged_at']} is withdrawn.",
        evidence=dict(basis=reading.root_letter.basis, withdrawn={key: decision.get(key) for key in ("status", "previous_strong", "new_strong", "new_prefixes", "logged_at")}),
    )


def outside_root_letter_batch(queue: list[Record], corpus: dict[str, Any], decisions: dict[str, dict[str, Any]],
                              reviews: dict[str, dict[str, Any]], lexicon: LexiconIndex) -> dict[str, Any]:
    queued, lemmas = {entry["location"] for entry in queue}, lexicon_lemmas(lexicon)
    proposals, unresolved = [], []
    for _, _, _, current, location in words(corpus):
        decision = decisions.get(location)
        corrected = decision is not None and decision.get("issue_type") == ROOT_LETTER_ISSUE
        word = decision["occurrence"] if corrected else current
        strong = word.get("strong")
        if location in queued or not word.get("prefixes") or not strong or strong.startswith("D"):
            continue
        reading = outside_reading(word, reviews.get(location), lexicon, lemmas)
        if reading.root_letter is None:
            continue
        if reading.root_letter.certain:
            proposals.append(outside_root_letter_decision(location, word, reading, reviews.get(location)))
        else:
            unresolved.append(dict(location=location, text=word["text"], strong=strong, prefixes=word["prefixes"],
                                   lemma=reading.lemma, reason=reading.root_letter.basis))
            if corrected:
                proposals.append(withdrawn_root_letter_decision(location, current, decision, reading))
    return dict(issue=380, rule="root_letter_prefix_outside_queue", rule_version=1, decisions=proposals, unresolved=unresolved)


def outside_root_letter_batch_from_disk() -> dict[str, Any]:
    queue = json.loads(gzip.decompress(REPORT.read_bytes()))["review_queue"]
    decisions_dir = REPORTS.parent / "decisions"
    lexicon = LexiconIndex(ROOT / "data/dict/lexicon/words")
    return outside_root_letter_batch(queue, load_corpus(), load_latest_decisions(decisions_dir), strong_reviews(decisions_dir), lexicon)


def revert_corrections(corpus: dict[str, Any], records: list[Record]) -> dict[str, Any]:
    reverted = copy.deepcopy(corpus)
    index = {key: (path, verse, word) for path, verse, _, word, key in words(reverted)}
    for record in records:
        if record["disposition"] != "corrected":
            continue
        path, verse, word = index[record["location"]]
        if word.get("prefixes", []) != record["after"]["prefixes"]:
            raise ValueError(f"{record['location']}: corpus prefixes differ from the corrected ledger value")
        if word.get("strong") != record["after"]["strong"]:
            raise ValueError(f"{record['location']}: corpus Strong differs from the corrected ledger value")
        rebuilt = copy.deepcopy(verse)
        _refresh_verse_prefix_separators([rebuilt], {"verse": verse["verse"]})
        if rebuilt["hebrew"] != verse["hebrew"]:
            raise ValueError(f"{record['location']}: verse separators differ from the ones its words produce")
        word["prefixes"], word["strong"] = record["before"]["prefixes"], record["before"]["strong"]
        _refresh_verse_prefix_separators(chapter(reverted[path])["verses"], {"verse": verse["verse"]})
    return reverted


def revert_file(path: str, payload: Any, records: list[Record]) -> Any:
    keys = {key for *_, key in words({path: payload})}
    return revert_corrections({path: payload}, [r for r in records if r["location"] in keys])[path]
