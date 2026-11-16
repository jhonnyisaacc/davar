"""Turn TTH footnotes that name a Greek term into unreviewed relationship candidates."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from scripts.books import book_by_tth_code
from scripts.paths import DATA, ROOT

TTH_JSON = DATA / "tth" / "json"
TERMS = DATA / "relationships" / "terms.json"
CANDIDATES = DATA / "relationships" / "candidates.json"
CATALOG = ROOT / "shared" / "contextualRelationships.json"
DELITZSCH = DATA / "delitzsch" / "parsed"
TANAKH = DATA / "dict" / "books"
HEBREW_LEXICON = DATA / "dict" / "lexicon" / "words"
GREEK_PREVIEW = DATA / "greek" / "preview" / "greek"

CATALOG_SCHEMA = "davar-contextual-relationships-v1"
CANDIDATES_SCHEMA = "davar-contextual-relationship-candidates-v1"
CREDIT = "Texto tomado de la Traducción Textual del Hebreo, Copyright por Natanael Doldan. Usado con permiso."

GREEK_TERMS = re.compile(r"\bGr\.:\s*([^.]+)\.")
HEBREW_TERMS = re.compile(r"\bHeb\.:\s*([^.]+)\.")
SCOPE_HINT = re.compile(r"Así también en .*$")


@dataclass(frozen=True)
class Footnote:
    path: str
    json_pointer: str
    tth_name: str
    book_id: str
    in_besorah: bool
    chapter: int
    verse: int
    number: str
    explanation: str

    @property
    def locator(self) -> str:
        return f"{self.tth_name} {self.chapter}:{self.verse}, nota {self.number}"

    @property
    def greek_terms(self) -> list[str]:
        return _terms(GREEK_TERMS, self.explanation)

    @property
    def hebrew_terms(self) -> list[str]:
        return _terms(HEBREW_TERMS, self.explanation)


def _terms(pattern: re.Pattern[str], text: str) -> list[str]:
    return [
        re.sub(r"^\d+", "", term.strip())
        for match in pattern.finditer(text)
        for term in match.group(1).split(",")
    ]


def footnotes(tth_json: Path = TTH_JSON) -> list[Footnote]:
    found = []
    for path in sorted(tth_json.glob("*.json")):
        book = json.loads(path.read_text(encoding="utf-8"))
        info = book["book_info"]
        registry = book_by_tth_code(info["book_id"])
        for ci, chapter in enumerate(book["chapters"]):
            for vi, verse in enumerate(chapter["verses"]):
                for fi, note in enumerate(verse.get("footnotes", [])):
                    if not GREEK_TERMS.search(note["explanation"]):
                        continue
                    found.append(
                        Footnote(
                            path=path.relative_to(ROOT).as_posix(),
                            json_pointer=f"/chapters/{ci}/verses/{vi}/footnotes/{fi}",
                            tth_name=info["tth_name"],
                            book_id=registry["id"],
                            in_besorah=registry["section"] == "besorah",
                            chapter=chapter["chapter"],
                            verse=verse["verse"],
                            number=note["number"],
                            explanation=note["explanation"],
                        )
                    )
    return found


def _base_strong(value: str | None) -> str | None:
    match = re.search(r"([GH])0*(\d+)[A-Za-z]?$", (value or "").split("/")[-1])
    if not match:
        return None
    letter, digits = match.groups()
    return f"G{digits.zfill(4)}" if letter == "G" else f"H{digits}"


@lru_cache(maxsize=1)
def _greek_revision_dir() -> Path:
    manifest = json.loads((GREEK_PREVIEW / "manifest.json").read_text(encoding="utf-8"))
    return GREEK_PREVIEW / "releases" / manifest["edition"] / manifest["revision"]


@lru_cache(maxsize=1)
def _greek_lexicon() -> dict:
    return json.loads((_greek_revision_dir() / "lexicon.json").read_text(encoding="utf-8"))


def greek_lemma(strong: str) -> str | None:
    lemmas = {
        entry["lemma"]
        for key, entry in _greek_lexicon().items()
        if _base_strong(key) == strong
    }
    return unicodedata.normalize("NFC", lemmas.pop()) if len(lemmas) == 1 else None


def hebrew_lemma(strong: str) -> str | None:
    path = HEBREW_LEXICON / f"{strong}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8")).get("lemma") or None


def _greek_tokens(book_id: str, chapter: int, verse: int) -> list[tuple[str, str]]:
    path = _greek_revision_dir() / "books" / book_id / f"{chapter}.json"
    rows = json.loads(path.read_text(encoding="utf-8"))["verses"]
    return [
        (word["text"], word["strong"])
        for row in rows
        if row["verse"] == verse
        for word in row["words"]
    ]


def _delitzsch_tokens(book_id: str, chapter: int, verse: int) -> list[tuple[str, str]]:
    path = DELITZSCH / book_id / f"{chapter}.json"
    return [
        (word["text"], word["strong"])
        for block in json.loads(path.read_text(encoding="utf-8"))
        for row in block["verses"]
        if row["chapter"] == chapter and row["verse"] == verse
        for word in row["words"]
    ]


def _tanakh_tokens(book_id: str, chapter: int, verse: int) -> list[tuple[str, str]]:
    book = json.loads((TANAKH / f"{book_id}.json").read_text(encoding="utf-8"))
    row = book.get(str(chapter), {}).get(str(verse), {"words": []})
    return [(word["hebrew"], word["strong_number"]) for word in row["words"]]


def _verse_check(source: str, tokens: list[tuple[str, str]], strong: str) -> dict:
    if not tokens:
        return {"source": source, "status": "verse_missing", "tokens": []}
    hits = [text for text, tag in tokens if _base_strong(tag) == strong]
    return {"source": source, "status": "found" if hits else "absent", "tokens": hits}


def precheck(note: Footnote, language: str, strong: str) -> dict:
    where = (note.book_id, note.chapter, note.verse)
    if language == "greek":
        if not note.in_besorah:
            return {
                "source": "none",
                "status": "unchecked",
                "reason": "No Greek text of the Tanakh (LXX) is in the repo.",
                "tokens": [],
            }
        return _verse_check("tagnt", _greek_tokens(*where), strong)
    if note.in_besorah:
        return _verse_check("delitzsch", _delitzsch_tokens(*where), strong)
    return _verse_check("oshb", _tanakh_tokens(*where), strong)


def _transliteration(term: str) -> str:
    decomposed = unicodedata.normalize("NFD", term)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()


def _resolve(term: str, language: str, terms: dict) -> tuple[dict | None, str | None]:
    if term in terms["no_strong"]:
        return None, terms["no_strong"][term]
    strong = terms[language].get(term)
    if strong is None:
        raise SystemExit(f"{language} term {term!r} is not in {TERMS.relative_to(ROOT)}")
    lemma = (greek_lemma if language == "greek" else hebrew_lemma)(strong)
    if lemma is None:
        return None, f"{strong} has no single lemma in the repo lexicon."
    side = {
        "language": language,
        "strong": strong,
        "lemma": lemma,
        "transliteration": _transliteration(term),
    }
    return side, None


def _record(note: Footnote, greek: dict, hebrew: dict) -> dict:
    return {
        "id": f"{greek['strong'].lower()}-{hebrew['strong'].lower()}-{note.book_id}-{note.chapter}-{note.verse}",
        "predicate": "contextually_related_to",
        "source": greek,
        "target": hebrew,
        "scope": [
            {
                "system_id": "davar-v1",
                "kind": "verse",
                "book_id": note.book_id,
                "chapter": note.chapter,
                "verse": note.verse,
            }
        ],
        "rationale": {"es": note.explanation},
        "attribution": {
            "credit": CREDIT,
            "locator": note.locator,
        },
        "provenance": {
            "source_id": "tth",
            "path": note.path,
            "json_pointer": note.json_pointer,
            "origin": "source",
            "transformation": "extracted",
        },
        "review": {"status": "unreviewed"},
    }


def build(notes: list[Footnote], terms: dict) -> tuple[list[dict], list[dict]]:
    records = []
    candidates = []
    for note in notes:
        pairs = []
        for greek_term in note.greek_terms if note.hebrew_terms else []:
            for hebrew_term in note.hebrew_terms:
                greek, greek_reason = _resolve(greek_term, "greek", terms)
                hebrew, hebrew_reason = _resolve(hebrew_term, "hebrew", terms)
                record = _record(note, greek, hebrew) if greek and hebrew else None
                if record:
                    records.append(record)
                pairs.append(
                    {
                        "greek": greek_term,
                        "hebrew": hebrew_term,
                        "record_id": record["id"] if record else None,
                        "unresolved": [r for r in (greek_reason, hebrew_reason) if r],
                        "precheck": {
                            side["language"]: {
                                "strong": side["strong"],
                                "lemma": side["lemma"],
                                **precheck(note, side["language"], side["strong"]),
                            }
                            for side in (greek, hebrew)
                            if side
                        },
                    }
                )
        hint = SCOPE_HINT.search(note.explanation)
        candidates.append(
            {
                "path": note.path,
                "json_pointer": note.json_pointer,
                "locator": note.locator,
                "explanation": note.explanation,
                "greek_terms": note.greek_terms,
                "hebrew_terms": note.hebrew_terms,
                "kind": "two_language" if note.hebrew_terms else "greek_only",
                "scope_hint": hint.group(0) if hint else None,
                "pairs": pairs,
            }
        )
    return records, candidates


def _owned(record: dict) -> bool:
    provenance = record.get("provenance", {})
    return provenance.get("source_id") == "tth" and provenance.get("transformation") == "extracted"


def _content(record: dict) -> dict:
    return {key: value for key, value in record.items() if key != "review"}


def merge(existing: list[dict], generated: list[dict]) -> list[dict]:
    fresh = {record["id"]: record for record in generated}
    if len(fresh) != len(generated):
        raise SystemExit("two footnotes produce the same record id")
    merged = []
    for record in existing:
        if not _owned(record):
            merged.append(record)
            continue
        replacement = fresh.pop(record["id"], None)
        if replacement is None:
            if record["review"]["status"] != "unreviewed":
                raise SystemExit(
                    f"{record['id']} has a recorded review but no longer matches a footnote"
                )
            continue
        if record["review"]["status"] != "unreviewed" and _content(record) != _content(replacement):
            raise SystemExit(
                f"{record['id']} has a recorded review but its footnote content changed; "
                "re-review it and record the decision again"
            )
        merged.append({**replacement, "review": record["review"]})
    return merged + [fresh[key] for key in sorted(fresh)]


def _dumps(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, indent="\t") + "\n"


def render(catalog_path: Path = CATALOG) -> dict[Path, str]:
    terms = json.loads(TERMS.read_text(encoding="utf-8"))
    records, candidates = build(footnotes(), terms)
    existing = json.loads(catalog_path.read_text(encoding="utf-8"))["relationships"]
    return {
        catalog_path: _dumps(
            {"schema": CATALOG_SCHEMA, "relationships": merge(existing, records)}
        ),
        CANDIDATES: _dumps({"schema": CANDIDATES_SCHEMA, "candidates": candidates}),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail when an output is stale")
    args = parser.parse_args(argv)
    outputs = render()
    stale = [
        path
        for path, text in outputs.items()
        if not path.exists() or path.read_text(encoding="utf-8") != text
    ]
    if args.check:
        for path in stale:
            print(f"stale: {os.path.relpath(path, ROOT)}", file=sys.stderr)
        return 1 if stale else 0
    for path in stale:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(outputs[path], encoding="utf-8")
        print(f"wrote {os.path.relpath(path, ROOT)}")
    return 0
