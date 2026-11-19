"""Candidate identities, with evidence, for occurrences a lexical review blocked (issue #42).

Each blocked occurrence gets its token, prefixes, the verse, the SBLGNT words of the verse,
the custom entries whose Hebrew is the token or a prefix-stripped stem, the canonical entries
whose lemma is such a stem, and the identities other reviewed occurrences of the same stem use.
The report proposes nothing on its own authority: a reviewer judges each candidate.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from scripts.delitzsch.review.dispositions import PREFIX_LETTERS, read_ledger
from scripts.delitzsch.review.remediate import ROOT, encoded, load_corpus, words
from scripts.delitzsch.review.workflow import LexiconIndex, load_latest_decisions, normalize_hebrew

GREEK = ROOT / "data/greek/preview/greek/releases/sblgnt/5de0a47f35f0fc13dfe1430d104e5db8a4285f9c"
LETTER_PREFIXES = {letter: code for code, letter in PREFIX_LETTERS.items()} | {"ש": "Hs"}
CONTENT = ("N-", "A-", "V-", "ADV")


def stems(consonants: str) -> list[tuple[str, str]]:
    found = [("", consonants)]
    for length in range(1, min(3, len(consonants) - 2) + 1):
        head = consonants[:length]
        if all(letter in LETTER_PREFIXES for letter in head):
            found.append((head, consonants[length:]))
    return found


def greek_verse(book: str, chapter_number: int, verse: int, cache: dict[tuple[str, int], Any]) -> list[dict[str, Any]]:
    key = (book, chapter_number)
    if key not in cache:
        path = GREEK / "books" / book / f"{chapter_number}.json"
        cache[key] = json.loads(path.read_text(encoding="utf-8"))["verses"] if path.exists() else []
    return [w for v in cache[key] if v["verse"] == verse for w in v["words"]]


def greek_glosses() -> dict[str, str]:
    lexicon = json.loads((GREEK / "lexicon.json").read_text(encoding="utf-8"))
    return {strong: (entry.get("definitions", {}).get("en") or {}).get("short", "") for strong, entry in lexicon.items()}


def reviewed_identities(corpus: dict[str, Any], decisions: dict[str, dict[str, Any]]) -> dict[str, Counter]:
    by_stem: dict[str, Counter] = defaultdict(Counter)
    for *_, word, key in words(corpus):
        decision = decisions.get(key)
        if not word.get("strong") or decision is None or decision["status"] not in {"applied", "already_applied", "skipped"}:
            continue
        if decision.get("reviewer", "").startswith("rule:"):
            continue
        for _, stem in stems(normalize_hebrew(word["text"])):
            by_stem[stem][word["strong"].split("/")[-1]] += 1
    return by_stem


def lemma_index(lexicon: LexiconIndex) -> dict[str, list[str]]:
    index: dict[str, list[str]] = defaultdict(list)
    for directory in (lexicon.lexicon_words_dir, lexicon.lexicon_roots_dir):
        for path in sorted(directory.glob("H*.json")):
            lemma = lexicon.normalized_lemma(path.stem)
            if lemma:
                index[normalize_hebrew(lemma)].append(path.stem)
    for key, entry in sorted(lexicon.load_custom_entries().items()):
        hebrew = normalize_hebrew(entry.get("hebrew") or "")
        if hebrew:
            index[hebrew].append(key)
    return index


def gloss(lexicon: LexiconIndex, strong: str) -> str:
    entry = lexicon.get(strong) or {}
    definitions = entry.get("definitions") or []
    return (definitions[0].get("text_en") or "") if definitions else ""


def candidates(ledger: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    ledger = ledger or read_ledger()
    corpus = load_corpus()
    decisions = load_latest_decisions(ROOT / "data/delitzsch/review/decisions")
    lexicon = LexiconIndex(ROOT / "data/dict/lexicon/words")
    lemmas, reviewed, glosses, cache = lemma_index(lexicon), reviewed_identities(corpus, decisions), greek_glosses(), {}
    located = {key: (verse, index, word) for _, verse, index, word, key in words(corpus)}
    report = []
    for record in ledger["records"]:
        if record["disposition"] != "blocked" or record["rule"] != "lexical_review":
            continue
        verse, index, word = located[record["location"]]
        book, chapter_number, verse_number, _ = record["location"].split(".")
        consonants = normalize_hebrew(word["text"])
        report.append(dict(
            location=record["location"], text=word["text"], strong=word["strong"], prefixes=word.get("prefixes") or [],
            reason=record["evidence"].get("reason"),
            hebrew=" ".join(w["text"] for w in verse["words"]),
            stems=[
                dict(prefix_letters=head, stem=stem,
                     entries=[dict(strong=s, gloss=gloss(lexicon, s)) for s in lemmas.get(stem, [])],
                     reviewed=dict(reviewed.get(stem, Counter()).most_common(3)))
                for head, stem in stems(consonants)
            ],
            greek=[
                dict(strong=w["strong"], lemma=w["lemma"], gloss=glosses.get(w["strong"], ""))
                for w in greek_verse(book, int(chapter_number), int(verse_number), cache)
                if w["morph"].startswith(CONTENT)
            ],
        ))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = candidates()
    args.output.write_bytes(encoded(dict(issue=42, blocked=len(report), candidates=report)))
    print("blocked", len(report))


if __name__ == "__main__":
    main()
