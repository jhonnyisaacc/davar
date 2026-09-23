"""Review utilities for Delitzsch Strong's mappings.

The parsed Delitzsch files are the primary source. Source text and lexicon
entries are only used as evidence for review decisions.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


LEXICON_KEY_RE = re.compile(r"([HGD])(\d+)")
PREFIX_CODES = {"Hb", "Hl", "Hk", "Hc", "Hd", "Hm"}
DEFAULT_REVIEWER = "codex-delitzsch-review"
HEBREW_LETTERS = set(range(0x05D0, 0x05EB))
FINAL_TO_REGULAR = {
    "ך": "כ",
    "ם": "מ",
    "ן": "נ",
    "ף": "פ",
    "ץ": "צ",
}


def normalize_hebrew(text: str) -> str:
    """Normalize Hebrew text to consonants with final forms regularized."""

    return "".join(
        FINAL_TO_REGULAR.get(char, char)
        for char in text
        if ord(char) in HEBREW_LETTERS
    )


@dataclass(frozen=True)
class Occurrence:
    """A stable word occurrence identity from data/delitzsch/parsed."""

    book: str
    chapter: int
    verse: int
    word_index: int
    text: str
    strong: str | None
    prefixes: list[str]
    possible_proper_name: bool
    hebrew: str

    @property
    def key(self) -> str:
        return f"{self.book}.{self.chapter}.{self.verse}.{self.word_index}"


@dataclass(frozen=True)
class ReviewIssue:
    """A review item found by scanning parsed Delitzsch data."""

    issue_type: str
    severity: str
    occurrence: Occurrence
    current_strong: str | None
    suggested_strong: str | None
    reason: str
    evidence: list[str]
    confidence: float


@dataclass
class ApplyStats:
    """Apply command summary."""

    decisions_seen: int = 0
    word_updates: int = 0
    definition_updates: int = 0
    review_notes: int = 0
    skipped: int = 0
    errors: int = 0
    files_changed: int = 0
    log_entries: int = 0


class LexiconIndex:
    """Small lookup helper over data/dict/lexicon words and roots."""

    def __init__(self, lexicon_words_dir: Path, lexicon_roots_dir: Path | None = None):
        self.lexicon_words_dir = lexicon_words_dir
        self.lexicon_roots_dir = lexicon_roots_dir or lexicon_words_dir.parent / "roots"
        self.custom_definitions_path = lexicon_words_dir.parent / "custom_definitions.json"
        self._entries: dict[str, dict[str, Any] | None] = {}
        self._entry_paths: dict[str, Path] = {}
        self._custom_entries: dict[str, Any] | None = None

    def normalize_strong(self, value: str | None) -> str | None:
        if not value:
            return None
        matches = LEXICON_KEY_RE.findall(value.upper())
        if not matches:
            return None
        prefix, number = matches[-1]
        return f"{prefix}{number}"

    def load_custom_entries(self) -> dict[str, Any]:
        if self._custom_entries is None:
            if self.custom_definitions_path.exists():
                with self.custom_definitions_path.open("r", encoding="utf-8") as handle:
                    self._custom_entries = json.load(handle)
            else:
                self._custom_entries = {}
        return self._custom_entries

    def next_custom_key(self) -> str:
        custom = self.load_custom_entries()
        max_seen = 0
        for key in custom:
            match = re.fullmatch(r"D(\d+)", key.upper())
            if match:
                max_seen = max(max_seen, int(match.group(1)))
        return f"D{max_seen + 1:04d}"

    def entry_path(self, strong: str) -> Path:
        normalized = self.normalize_strong(strong) or strong
        if normalized in self._entry_paths:
            return self._entry_paths[normalized]
        words_path = self.lexicon_words_dir / f"{normalized}.json"
        if words_path.exists():
            return words_path
        roots_path = self.lexicon_roots_dir / f"{normalized}.json"
        if roots_path.exists():
            return roots_path
        return words_path

    def get(self, strong: str | None) -> dict[str, Any] | None:
        normalized = self.normalize_strong(strong)
        if not normalized:
            return None
        if normalized not in self._entries:
            if normalized.startswith("D"):
                self._entries[normalized] = self.load_custom_entries().get(normalized)
                return self._entries[normalized]
            words_path = self.lexicon_words_dir / f"{normalized}.json"
            roots_path = self.lexicon_roots_dir / f"{normalized}.json"
            path = words_path if words_path.exists() else roots_path
            if not path.exists():
                self._entries[normalized] = None
            else:
                self._entry_paths[normalized] = path
                with path.open("r", encoding="utf-8") as handle:
                    self._entries[normalized] = json.load(handle)
        return self._entries[normalized]

    def has_definitions(self, strong: str | None) -> bool:
        entry = self.get(strong)
        return bool(entry and entry.get("definitions"))

    def normalized_lemma(self, strong: str | None) -> str | None:
        entry = self.get(strong)
        if not entry:
            return None
        normalized = entry.get("normalized")
        if isinstance(normalized, str) and normalized:
            return normalized
        lemma = entry.get("lemma")
        if isinstance(lemma, str) and lemma:
            return normalize_hebrew(lemma)
        hebrew = entry.get("hebrew")
        if isinstance(hebrew, str) and hebrew:
            return normalize_hebrew(hebrew)
        return None


def project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def parsed_dir(root: Path | None = None) -> Path:
    return (root or project_root()) / "data" / "delitzsch" / "parsed"


def review_dir(root: Path | None = None) -> Path:
    return (root or project_root()) / "data" / "delitzsch" / "review"


def lexicon_words_dir(root: Path | None = None) -> Path:
    return (root or project_root()) / "data" / "dict" / "lexicon" / "words"


def iter_book_names(base_dir: Path, books: list[str] | None = None) -> list[str]:
    if books:
        return books
    return sorted(
        path.name
        for path in base_dir.iterdir()
        if path.is_dir() and path.name != "strongs"
    )


def iter_occurrences(
    base_dir: Path,
    books: list[str] | None = None,
) -> Iterable[Occurrence]:
    """Yield parsed word occurrences with verse-aware identity."""

    for book in iter_book_names(base_dir, books):
        book_dir = base_dir / book
        if not book_dir.exists():
            continue
        chapter_files = sorted(
            book_dir.glob("*.json"),
            key=lambda path: int(path.stem) if path.stem.isdigit() else 0,
        )
        for chapter_file in chapter_files:
            with chapter_file.open("r", encoding="utf-8") as handle:
                chapter_data = json.load(handle)

            chapter_obj = chapter_data[0] if isinstance(chapter_data, list) else chapter_data
            chapter_num = int(chapter_obj.get("chapter") or chapter_file.stem)
            for verse_data in chapter_obj.get("verses", []):
                verse_num = int(verse_data.get("verse", 0))
                hebrew = verse_data.get("hebrew", "")
                for word_index, word in enumerate(verse_data.get("words", [])):
                    yield Occurrence(
                        book=book,
                        chapter=chapter_num,
                        verse=verse_num,
                        word_index=word_index,
                        text=word.get("text", ""),
                        strong=word.get("strong"),
                        prefixes=list(word.get("prefixes") or []),
                        possible_proper_name=bool(word.get("possible_proper_name", False)),
                        hebrew=hebrew,
                    )


def stripped_word_stem(occurrence: Occurrence) -> str:
    """Normalize text and remove known prefix consonants by prefix count."""

    normalized = normalize_hebrew(occurrence.text)
    removable = sum(1 for prefix in occurrence.prefixes if prefix in PREFIX_CODES)
    if removable and len(normalized) > removable:
        return normalized[removable:]
    return normalized


def is_suspicious_assignment(
    occurrence: Occurrence,
    lexicon: LexiconIndex,
    include_lemma_mismatch: bool = False,
) -> tuple[bool, str]:
    """Return a conservative mismatch signal for existing non-null assignments."""

    strong = lexicon.normalize_strong(occurrence.strong)
    if not strong:
        return True, "Strong field does not contain a valid H#### code"

    lemma = lexicon.normalized_lemma(strong)
    if not lemma:
        return True, f"Lexicon entry missing for {strong}"

    if not include_lemma_mismatch:
        return False, ""

    stem = stripped_word_stem(occurrence)
    if not stem:
        return True, "Could not normalize parsed word"

    if stem == lemma or stem.startswith(lemma) or lemma.startswith(stem):
        return False, ""

    # Keep this intentionally conservative. Inflected verbs often differ from
    # lemmas, so short stems are noisy unless they have no visible overlap.
    shared = set(stem).intersection(set(lemma))
    if len(stem) >= 5 and len(lemma) >= 3 and len(shared) <= 1:
        return True, f"Normalized word stem '{stem}' has little overlap with {strong} lemma '{lemma}'"

    return False, ""


def scan_issues(
    base_dir: Path,
    lexicon: LexiconIndex,
    books: list[str] | None = None,
    include_suspicious: bool = True,
    include_lemma_mismatch: bool = False,
    include_definition_review: bool = False,
) -> list[ReviewIssue]:
    issues: list[ReviewIssue] = []
    seen_definition_keys: set[str] = set()
    for occurrence in iter_occurrences(base_dir, books):
        normalized_strong = lexicon.normalize_strong(occurrence.strong)
        evidence = [
            f"occurrence={occurrence.key}",
            f"text={occurrence.text}",
            f"prefixes={','.join(occurrence.prefixes) or 'none'}",
        ]

        if occurrence.strong is None:
            issues.append(
                ReviewIssue(
                    issue_type="null_strong",
                    severity="high",
                    occurrence=occurrence,
                    current_strong=None,
                    suggested_strong=None,
                    reason="Parsed word has no Strong assignment",
                    evidence=evidence,
                    confidence=0.0,
                )
            )
            continue

        if include_definition_review and normalized_strong and normalized_strong not in seen_definition_keys:
            seen_definition_keys.add(normalized_strong)
            entry = lexicon.get(normalized_strong) or {}
            definitions = entry.get("definitions") or []
            definition_summary = [
                (item.get("text_en") or item.get("text") or item.get("text_es") or "")
                for item in definitions[:5]
                if isinstance(item, dict)
            ]
            issues.append(
                ReviewIssue(
                    issue_type="definition_review",
                    severity="low",
                    occurrence=occurrence,
                    current_strong=occurrence.strong,
                    suggested_strong=normalized_strong,
                    reason=f"Review definitions for {normalized_strong}",
                    evidence=evidence
                    + [
                        f"strong={normalized_strong}",
                        f"lemma={entry.get('lemma') or entry.get('hebrew') or ''}",
                        f"definitions={' | '.join(definition_summary) if definition_summary else 'none'}",
                    ],
                    confidence=0.0,
                )
            )

        if occurrence.possible_proper_name and not lexicon.has_definitions(normalized_strong):
            issues.append(
                ReviewIssue(
                    issue_type="proper_name_missing_definition",
                    severity="medium",
                    occurrence=occurrence,
                    current_strong=occurrence.strong,
                    suggested_strong=normalized_strong,
                    reason=f"Proper-name occurrence points to {normalized_strong}, but the lexicon entry has no definitions",
                    evidence=evidence + [f"strong={normalized_strong}"],
                    confidence=0.8,
                )
            )

        if include_suspicious:
            suspicious, reason = is_suspicious_assignment(
                occurrence,
                lexicon,
                include_lemma_mismatch=include_lemma_mismatch,
            )
            if suspicious:
                issues.append(
                    ReviewIssue(
                        issue_type="suspicious_strong",
                        severity="medium",
                        occurrence=occurrence,
                        current_strong=occurrence.strong,
                        suggested_strong=None,
                        reason=reason,
                        evidence=evidence + [f"strong={occurrence.strong}"],
                        confidence=0.35,
                    )
                )

    return issues


def summarize_issues(issues: list[ReviewIssue]) -> dict[str, Any]:
    by_type: dict[str, int] = {}
    by_book: dict[str, int] = {}
    for issue in issues:
        by_type[issue.issue_type] = by_type.get(issue.issue_type, 0) + 1
        by_book[issue.occurrence.book] = by_book.get(issue.occurrence.book, 0) + 1
    return {
        "total_issues": len(issues),
        "by_type": dict(sorted(by_type.items())),
        "by_book": dict(sorted(by_book.items())),
    }


def load_latest_decisions(log_dir: Path) -> dict[str, dict[str, Any]]:
    """Load the latest logged review decision for each stable occurrence."""

    latest: dict[str, dict[str, Any]] = {}
    if not log_dir.exists():
        return latest
    for log_file in sorted(log_dir.glob("*.jsonl")):
        with log_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                entry = json.loads(line)
                occurrence = entry.get("occurrence") or {}
                try:
                    key = (
                        f"{occurrence['book']}.{int(occurrence['chapter'])}."
                        f"{int(occurrence['verse'])}.{int(occurrence['word_index'])}"
                    )
                except (KeyError, TypeError, ValueError):
                    continue
                latest[key] = entry
    return latest


def issue_review_status(
    issue: ReviewIssue,
    latest_decisions: dict[str, dict[str, Any]],
) -> str:
    """Classify a current scan flag using its latest provenance decision."""

    status = str((latest_decisions.get(issue.occurrence.key) or {}).get("status") or "")
    return {
        "applied": "reviewed_resolved",
        "already_applied": "reviewed_resolved",
        "needs_manual_review": "reviewed_manual",
        "skipped": "reviewed_skipped",
    }.get(status, "unreviewed")


def partition_reviewed_issues(
    issues: list[ReviewIssue],
    latest_decisions: dict[str, dict[str, Any]],
) -> tuple[list[ReviewIssue], dict[str, list[ReviewIssue]]]:
    """Separate actionable flags from reviewed manual/skipped/resolved flags."""

    unreviewed: list[ReviewIssue] = []
    reviewed: dict[str, list[ReviewIssue]] = {}
    for issue in issues:
        status = issue_review_status(issue, latest_decisions)
        if status == "unreviewed":
            unreviewed.append(issue)
        else:
            reviewed.setdefault(status, []).append(issue)
    return unreviewed, reviewed


def summarize_reviewed_issues(
    reviewed: dict[str, list[ReviewIssue]],
) -> dict[str, Any]:
    """Summarize non-actionable scan flags by their provenance classification."""

    all_reviewed = [issue for issues in reviewed.values() for issue in issues]
    summary = summarize_issues(all_reviewed)
    summary["by_review_status"] = {
        status: len(issues) for status, issues in sorted(reviewed.items())
    }
    return summary


def summarize_decision_logs(log_dir: Path) -> dict[str, Any]:
    """Summarize applied/reviewed decision provenance logs."""

    summary: dict[str, Any] = {
        "total_log_entries": 0,
        "by_status": {},
        "by_action": {},
        "confidence": {
            "count": 0,
            "min": None,
            "max": None,
            "average": None,
        },
    }
    confidences: list[float] = []

    if not log_dir.exists():
        return summary

    for log_file in sorted(log_dir.glob("*.jsonl")):
        with log_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                entry = json.loads(line)
                summary["total_log_entries"] += 1
                status = entry.get("status", "unknown")
                action = entry.get("action", "unknown")
                summary["by_status"][status] = summary["by_status"].get(status, 0) + 1
                summary["by_action"][action] = summary["by_action"].get(action, 0) + 1
                confidence = entry.get("confidence")
                if isinstance(confidence, (int, float)):
                    confidences.append(float(confidence))

    if confidences:
        summary["confidence"] = {
            "count": len(confidences),
            "min": min(confidences),
            "max": max(confidences),
            "average": sum(confidences) / len(confidences),
        }
    summary["by_status"] = dict(sorted(summary["by_status"].items()))
    summary["by_action"] = dict(sorted(summary["by_action"].items()))
    return summary


def issue_to_decision_stub(issue: ReviewIssue) -> dict[str, Any]:
    occurrence = asdict(issue.occurrence)
    return {
        "action": "needs_manual_review",
        "issue_type": issue.issue_type,
        "occurrence": occurrence,
        "previous_strong": issue.current_strong,
        "new_strong": issue.suggested_strong,
        "confidence": issue.confidence,
        "reason": issue.reason,
        "evidence": issue.evidence,
        "reviewer": DEFAULT_REVIEWER,
    }


def generate_batch(
    issues: list[ReviewIssue],
    limit: int,
    issue_types: set[str] | None = None,
) -> dict[str, Any]:
    selected: list[ReviewIssue] = []
    for issue in issues:
        if issue_types and issue.issue_type not in issue_types:
            continue
        selected.append(issue)
        if len(selected) >= limit:
            break

    return {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "instructions": (
            "Edit decisions in this file, then run review apply. Supported actions: "
            "set_strong, add_definition, upsert_custom_definition, "
            "create_custom_entry, needs_manual_review, skip."
        ),
        "decisions": [issue_to_decision_stub(issue) for issue in selected],
    }


def generate_batches(
    issues: list[ReviewIssue],
    chunk_size: int,
    issue_types: set[str] | None = None,
) -> list[dict[str, Any]]:
    filtered = [
        issue for issue in issues
        if not issue_types or issue.issue_type in issue_types
    ]
    return [
        generate_batch(filtered[index:index + chunk_size], chunk_size)
        for index in range(0, len(filtered), chunk_size)
    ]


def _load_chapter_file(
    base_dir: Path,
    occurrence: dict[str, Any],
    cache: dict[Path, Any] | None = None,
) -> tuple[Path, Any, list[dict[str, Any]]]:
    chapter_file = base_dir / occurrence["book"] / f"{int(occurrence['chapter'])}.json"
    if not chapter_file.exists():
        raise FileNotFoundError(f"Chapter file not found: {chapter_file}")
    if cache is not None and chapter_file in cache:
        chapter_data = cache[chapter_file]
    else:
        with chapter_file.open("r", encoding="utf-8") as handle:
            chapter_data = json.load(handle)
        if cache is not None:
            cache[chapter_file] = chapter_data
    chapter_obj = chapter_data[0] if isinstance(chapter_data, list) else chapter_data
    return chapter_file, chapter_data, chapter_obj.get("verses", [])


def _find_word(verses: list[dict[str, Any]], occurrence: dict[str, Any]) -> dict[str, Any]:
    for verse in verses:
        if int(verse.get("verse", 0)) != int(occurrence["verse"]):
            continue
        words = verse.get("words", [])
        word_index = int(occurrence["word_index"])
        if word_index >= len(words):
            raise IndexError(f"word_index {word_index} out of range for {occurrence}")
        word = words[word_index]
        if word.get("text") != occurrence.get("text"):
            raise ValueError(
                f"Occurrence text mismatch at {occurrence}: found {word.get('text')!r}"
            )
        return word
    raise ValueError(f"Verse not found for occurrence {occurrence}")


def _apply_word_metadata(word: dict[str, Any], decision: dict[str, Any]) -> bool:
    """Apply optional reviewed prefix and proper-name metadata changes."""

    changed = False
    if "new_prefixes" in decision:
        prefixes = decision["new_prefixes"]
        if not isinstance(prefixes, list) or any(
            not isinstance(prefix, str) or prefix not in PREFIX_CODES
            for prefix in prefixes
        ):
            raise ValueError(f"Invalid new_prefixes: {prefixes!r}")
        if word.get("prefixes", []) != prefixes:
            word["prefixes"] = prefixes
            changed = True
    if "new_possible_proper_name" in decision:
        possible_proper_name = decision["new_possible_proper_name"]
        if not isinstance(possible_proper_name, bool):
            raise ValueError(
                f"new_possible_proper_name must be boolean: {possible_proper_name!r}"
            )
        if bool(word.get("possible_proper_name", False)) != possible_proper_name:
            word["possible_proper_name"] = possible_proper_name
            changed = True
    return changed


def _refresh_verse_prefix_separators(
    verses: list[dict[str, Any]], occurrence: dict[str, Any]
) -> None:
    """Keep the display Hebrew separators synchronized with reviewed prefixes."""

    from ..result_formatter import ResultFormatter

    verse_number = int(occurrence["verse"])
    for verse in verses:
        if int(verse.get("verse", 0)) != verse_number:
            continue
        clean_hebrew = str(verse.get("hebrew") or "").replace("/", "")
        verse["hebrew"] = ResultFormatter(None).add_prefix_separators(
            clean_hebrew, verse.get("words") or []
        )
        return


def append_decision_log(log_dir: Path, decision: dict[str, Any], status: str, dry_run: bool) -> None:
    if dry_run:
        return
    log_dir.mkdir(parents=True, exist_ok=True)
    occurrence = decision.get("occurrence") or {}
    book = occurrence.get("book") or decision.get("book") or "lexicon"
    entry = {
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        **decision,
    }
    with (log_dir / f"{book}.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")


def _custom_instance_from_occurrence(occurrence: dict[str, Any]) -> dict[str, Any]:
    return {
        "book": occurrence["book"],
        "chapter": int(occurrence["chapter"]),
        "verse": int(occurrence["verse"]),
        "word_index": int(occurrence["word_index"]),
        "text": occurrence.get("text", ""),
    }


def _add_custom_entry(
    lexicon: LexiconIndex,
    decision: dict[str, Any],
) -> tuple[str, bool]:
    occurrence = decision["occurrence"]
    custom = lexicon.load_custom_entries()
    key = (decision.get("custom_key") or decision.get("new_strong") or "").strip().upper()
    if not key:
        key = lexicon.next_custom_key()
    if not re.fullmatch(r"D\d+", key):
        raise ValueError(f"Custom keys must use D#### format, got {key!r}")

    definition = decision.get("definition")
    if not isinstance(definition, dict) or not (definition.get("text_en") or definition.get("text_es")):
        raise ValueError("create_custom_entry requires definition.text_en or definition.text_es")

    created = key not in custom
    entry = custom.setdefault(
        key,
        {
            "strong_number": key,
            "hebrew": decision.get("hebrew") or occurrence.get("text", ""),
            "transliteration_es": decision.get("transliteration_es", ""),
            "transliteration_en": decision.get("transliteration_en", ""),
            "is_custom": True,
            # A Delitzsch review establishes this lexeme for its recorded
            # occurrences. Other corpora must opt into global reuse explicitly
            # after their own lexical review.
            "mapping_scope": decision.get("mapping_scope", "instances_only"),
            "definitions": [],
            "root": decision.get("root", ""),
            "root_strong": decision.get("root_strong", ""),
            "manual_instances": [],
            "nt_instances": [],
        },
    )
    entry.setdefault("strong_number", key)
    entry.setdefault("is_custom", True)
    entry.setdefault(
        "mapping_scope", decision.get("mapping_scope", "instances_only")
    )
    entry.setdefault("definitions", [])
    entry.setdefault("nt_instances", [])

    definition.setdefault("source", "custom")
    definition.setdefault("order", len(entry["definitions"]) + 1)
    if not any(
        item.get("text_en") == definition.get("text_en")
        and item.get("text_es") == definition.get("text_es")
        for item in entry["definitions"]
    ):
        entry["definitions"].append(definition)

    instance = _custom_instance_from_occurrence(occurrence)
    if not any(
        item.get("book") == instance["book"]
        and int(item.get("chapter", -1)) == instance["chapter"]
        and int(item.get("verse", -1)) == instance["verse"]
        and int(item.get("word_index", -1)) == instance["word_index"]
        for item in entry["nt_instances"]
    ):
        entry["nt_instances"].append(instance)

    return key, created


def _upsert_custom_definition(
    lexicon: LexiconIndex,
    decision: dict[str, Any],
) -> str:
    key = lexicon.normalize_strong(decision.get("strong") or decision.get("new_strong"))
    if not key:
        raise ValueError("upsert_custom_definition requires strong or new_strong")
    definition = decision.get("definition")
    if not isinstance(definition, dict) or not (definition.get("text_en") or definition.get("text_es")):
        raise ValueError("upsert_custom_definition requires definition.text_en or definition.text_es")

    custom = lexicon.load_custom_entries()
    existing = lexicon.get(key) or {}
    entry = custom.setdefault(
        key,
        {
            "strong_number": key,
            "hebrew": existing.get("hebrew") or existing.get("lemma") or decision.get("hebrew", ""),
            "transliteration_es": (
                existing.get("translit_es")
                or existing.get("transliteration_es")
                or decision.get("transliteration_es", "")
            ),
            "transliteration_en": (
                existing.get("translit_en")
                or existing.get("transliteration_en")
                or decision.get("transliteration_en", "")
            ),
            "is_custom": True,
            "definitions": [],
            "root": decision.get("root", ""),
            "root_strong": existing.get("root_ref") or existing.get("root_strong") or decision.get("root_strong", ""),
            "manual_instances": [],
        },
    )
    entry.setdefault("strong_number", key)
    entry.setdefault("is_custom", True)
    entry.setdefault("definitions", [])
    definition.setdefault("source", "custom")
    definition.setdefault("order", len(entry["definitions"]) + 1)

    replace_order = decision.get("replace_order")
    if replace_order is not None:
        for index, item in enumerate(entry["definitions"]):
            if int(item.get("order", -1)) == int(replace_order):
                definition["order"] = int(replace_order)
                entry["definitions"][index] = definition
                return key

    if not any(
        item.get("text_en") == definition.get("text_en")
        and item.get("text_es") == definition.get("text_es")
        for item in entry["definitions"]
    ):
        entry["definitions"].append(definition)
    return key


def apply_decisions(
    decisions_file: Path,
    base_dir: Path,
    lexicon: LexiconIndex,
    log_dir: Path,
    dry_run: bool = False,
) -> ApplyStats:
    with decisions_file.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    decisions = payload.get("decisions", payload if isinstance(payload, list) else [])

    stats = ApplyStats(decisions_seen=len(decisions))
    changed_chapters: dict[Path, Any] = {}
    loaded_chapters: dict[Path, Any] = {}
    changed_lexicon: dict[Path, dict[str, Any]] = {}

    for decision in decisions:
        action = decision.get("action", "needs_manual_review")
        try:
            if action == "skip":
                stats.skipped += 1
                append_decision_log(log_dir, decision, "skipped", dry_run)
                stats.log_entries += 0 if dry_run else 1
                continue

            if action == "needs_manual_review":
                stats.review_notes += 1
                append_decision_log(log_dir, decision, "needs_manual_review", dry_run)
                stats.log_entries += 0 if dry_run else 1
                continue

            if action == "set_strong":
                occurrence = decision["occurrence"]
                chapter_file, chapter_data, verses = _load_chapter_file(
                    base_dir,
                    occurrence,
                    loaded_chapters,
                )
                word = _find_word(verses, occurrence)
                expected_previous = decision.get("previous_strong", occurrence.get("strong"))
                new_strong = decision.get("new_strong")
                metadata_changed = _apply_word_metadata(word, decision)
                if metadata_changed:
                    _refresh_verse_prefix_separators(verses, occurrence)
                if word.get("strong") == new_strong:
                    if metadata_changed:
                        changed_chapters[chapter_file] = chapter_data
                        stats.word_updates += 1
                        append_decision_log(log_dir, decision, "applied", dry_run)
                    else:
                        stats.skipped += 1
                        append_decision_log(log_dir, decision, "already_applied", dry_run)
                    stats.log_entries += 0 if dry_run else 1
                    continue
                if word.get("strong") != expected_previous:
                    raise ValueError(
                        f"Previous Strong mismatch for {occurrence}: expected "
                        f"{expected_previous!r}, found {word.get('strong')!r}"
                    )
                if not lexicon.normalize_strong(new_strong):
                    raise ValueError(f"Invalid new_strong for {occurrence}: {new_strong!r}")
                word["strong"] = new_strong
                changed_chapters[chapter_file] = chapter_data
                stats.word_updates += 1
                append_decision_log(log_dir, decision, "applied", dry_run)
                stats.log_entries += 0 if dry_run else 1
                continue

            if action == "create_custom_entry":
                occurrence = decision["occurrence"]
                chapter_file, chapter_data, verses = _load_chapter_file(
                    base_dir,
                    occurrence,
                    loaded_chapters,
                )
                word = _find_word(verses, occurrence)
                expected_previous = decision.get("previous_strong", occurrence.get("strong"))
                custom_key = (decision.get("custom_key") or decision.get("new_strong") or "").strip().upper()
                metadata_changed = _apply_word_metadata(word, decision)
                if metadata_changed:
                    _refresh_verse_prefix_separators(verses, occurrence)
                if custom_key and word.get("strong") == custom_key:
                    _add_custom_entry(lexicon, decision)
                    changed_lexicon[lexicon.custom_definitions_path] = lexicon.load_custom_entries()
                    if metadata_changed:
                        changed_chapters[chapter_file] = chapter_data
                        stats.word_updates += 1
                        append_decision_log(
                            log_dir,
                            {**decision, "new_strong": custom_key},
                            "applied",
                            dry_run,
                        )
                    else:
                        stats.skipped += 1
                        append_decision_log(
                            log_dir,
                            {**decision, "new_strong": custom_key},
                            "already_applied",
                            dry_run,
                        )
                    stats.log_entries += 0 if dry_run else 1
                    continue
                if word.get("strong") != expected_previous:
                    raise ValueError(
                        f"Previous Strong mismatch for {occurrence}: expected "
                        f"{expected_previous!r}, found {word.get('strong')!r}"
                    )
                custom_key, _created = _add_custom_entry(lexicon, decision)
                word["strong"] = custom_key
                changed_chapters[chapter_file] = chapter_data
                changed_lexicon[lexicon.custom_definitions_path] = lexicon.load_custom_entries()
                stats.word_updates += 1
                stats.definition_updates += 1
                append_decision_log(log_dir, {**decision, "new_strong": custom_key}, "applied", dry_run)
                stats.log_entries += 0 if dry_run else 1
                continue

            if action == "add_definition":
                strong = lexicon.normalize_strong(decision.get("strong") or decision.get("new_strong"))
                if not strong:
                    raise ValueError(f"add_definition decision missing valid strong: {decision}")
                entry = lexicon.get(strong)
                if not entry:
                    raise FileNotFoundError(f"Lexicon entry not found for {strong}")
                definition = decision.get("definition")
                if not isinstance(definition, dict) or not definition.get("text_en"):
                    raise ValueError(f"Definition must include at least text_en: {decision}")
                definitions = entry.setdefault("definitions", [])
                if not any(existing.get("text_en") == definition.get("text_en") for existing in definitions):
                    next_order = max([int(item.get("order", 0)) for item in definitions] or [0]) + 1
                    definition.setdefault("source", "delitzsch_review")
                    definition.setdefault("order", next_order)
                    definition.setdefault("sense", "0")
                    definitions.append(definition)
                    changed_lexicon[lexicon.entry_path(strong)] = entry
                    stats.definition_updates += 1
                else:
                    stats.skipped += 1
                append_decision_log(log_dir, decision, "applied", dry_run)
                stats.log_entries += 0 if dry_run else 1
                continue

            if action == "upsert_custom_definition":
                key = _upsert_custom_definition(lexicon, decision)
                changed_lexicon[lexicon.custom_definitions_path] = lexicon.load_custom_entries()
                stats.definition_updates += 1
                append_decision_log(log_dir, {**decision, "strong": key}, "applied", dry_run)
                stats.log_entries += 0 if dry_run else 1
                continue

            raise ValueError(f"Unsupported decision action: {action}")
        except Exception as exc:
            stats.errors += 1
            error_decision = {**decision, "error": str(exc)}
            append_decision_log(log_dir, error_decision, "error", dry_run)
            stats.log_entries += 0 if dry_run else 1

    if not dry_run:
        for file_path, data in changed_chapters.items():
            with file_path.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
        for file_path, data in changed_lexicon.items():
            with file_path.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")

    stats.files_changed = len(changed_chapters) + len(changed_lexicon)
    return stats
