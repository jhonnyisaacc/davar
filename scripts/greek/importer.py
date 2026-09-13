"""Build versioned SBLGNT + TBESG artifacts from official TAGNT/TBESG files."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Iterable

from scripts.greek.books import (
    BESORAH_BOOK_COUNT,
    TAGNT_SBL_ABSENT_VERSES,
    TAGNT_TO_DAVAR,
    davar_book_id,
)
from scripts.greek.edition import (
    READING_EDITION,
    TAGGING_SOURCE,
    parse_word_ref,
    verses_without_sbl,
)
from scripts.greek.parse_tagnt import TagntToken, assert_greek_strong, parse_tagnt_file
from scripts.greek.parse_tbesg import TbesgEntry, parse_tbesg_file
from scripts.greek.sources import (
    ALL_SOURCES,
    STEPBIBLE_COMMIT,
    STEPBIBLE_REPO,
    TAGNT_SOURCES,
)
from scripts.greek.stable_json import dumps, write_json

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "data" / "greek" / "sblgnt-tagnt" / STEPBIBLE_COMMIT


def _word_payload(token: TagntToken) -> dict:
    assert_greek_strong(token.strong)
    return {
        "index": token.index,
        "lemma": token.lemma,
        "morph": token.morph,
        "ref": token.ref,
        "strong": token.strong,
        "strong_lookup": token.strong_lookup,
        "text": token.text,
        "translit_en": token.translit_en,
        "word_type": token.word_type,
    }


def group_verses(tokens: Iterable[TagntToken]) -> dict[str, list[dict]]:
    books: dict[str, dict[tuple[int, str], dict]] = defaultdict(dict)
    for token in tokens:
        verse_key = (token.chapter, token.verse_id)
        verse = books[token.davar_book].setdefault(
            verse_key,
            {
                "chapter": token.chapter,
                "source_ref": f"{token.book}.{token.chapter}.{token.verse_id}",
                "verse": token.verse_number,
                "verse_id": token.verse_id,
                "words": [],
            },
        )
        verse["words"].append(_word_payload(token))
    grouped: dict[str, list[dict]] = {}
    for book_id, verses in books.items():
        grouped[book_id] = [verses[key] for key in sorted(verses)]
    return grouped


def build_occurrences(tokens: Iterable[TagntToken]) -> dict[str, dict]:
    """Count displayed SBLGNT tokens only. Strong’s stay in the G namespace."""
    occurrences: dict[str, dict] = {}
    for token in tokens:
        if not token.strong.startswith("G"):
            raise ValueError(f"Non-Greek Strong namespace: {token.strong}")
        key = token.strong
        bucket = occurrences.setdefault(
            key,
            {
                "count": 0,
                "lemma": token.lemma,
                "namespace": "G",
                "references": [],
                "strong": token.strong,
                "strong_lookup": token.strong_lookup,
            },
        )
        bucket["count"] += 1
        bucket["references"].append(
            {
                "book": token.davar_book,
                "chapter": token.chapter,
                "index": token.index,
                "ref": token.ref,
                "text": token.text,
                "verse": token.verse_number,
                "verse_id": token.verse_id,
            }
        )
    for bucket in occurrences.values():
        if bucket["count"] != len(bucket["references"]):
            raise ValueError(f"Occurrence count mismatch for {bucket['strong']}")
    return dict(sorted(occurrences.items()))


def lexicon_payload(entries: list[TbesgEntry]) -> dict[str, dict]:
    lexicon: dict[str, dict] = {}
    for entry in entries:
        lexicon[entry.dstrong] = {
            "estrong": entry.estrong,
            "fuller": entry.fuller,
            "fuller_html": entry.fuller_html,
            "lemma": entry.lemma,
            "morph": entry.morph,
            "related": entry.related,
            "short": entry.short,
            "strong": entry.dstrong,
            "translit_en": entry.translit_en,
        }
    return lexicon


def source_record() -> dict:
    return {
        "lexicon_source": "stepbible-tbesg",
        "reading_edition": READING_EDITION,
        "sources": [
            {
                "blob_sha": source.blob_sha,
                "filename": source.filename,
                "key": source.key,
                "path": source.relative_path,
            }
            for source in ALL_SOURCES
        ],
        "stepbible_commit": STEPBIBLE_COMMIT,
        "stepbible_repo": STEPBIBLE_REPO,
        "tagging_source": TAGGING_SOURCE,
    }


def modifications_markdown(absent: list[str], book_ids: list[str]) -> str:
    absent_lines = "\n".join(f"- `{item}`" for item in absent)
    books = ", ".join(book_ids)
    return f"""# Greek Besorah modifications — {STEPBIBLE_COMMIT}

Source: STEP Bible (www.STEPBible.org), Tyndale House, Cambridge, CC BY 4.0.
Repository: {STEPBIBLE_REPO}/tree/{STEPBIBLE_COMMIT}

## What changed

Davar reformats official TAGNT and TBESG into edition-namespaced JSON. Greek spelling, accents, punctuation, token order, lemmas, and disambiguated Strong’s identifiers are preserved. Only lookup keys are normalized.

## Edition selection

Displayed tokens are those whose TAGNT Editions field includes `SBL` (Holmes 2010). Alternatives without `SBL` are dropped, never concatenated. N/K/O is not the selector.

## Spelling and punctuation

If Spelling variants names `SBL`, that form is used. Otherwise the main Greek cell is used. TAGNT default spelling is NA28 for shared words. Punctuation follows TAGNT’s THGNT-based punctuation. This is not a byte-for-byte reprint of printed SBLGNT.

## Columns not used as dictionary text

TAGNT English (Berean, STEPBible-only permission) and Spanish (OpenGNT) columns are not stored as Davar definitions. English definitions come from TBESG.

## Books imported

{books}

## Absent SBL verses at this revision

These TAGNT identities have rows but no `SBL` token. They are recorded as absent and are not filled from Hebrew Besorah or NA28.

{absent_lines}
"""


def coverage_payload(
    tokens: list[TagntToken],
    absent: list[str],
    books: dict[str, list[dict]],
) -> dict:
    counts = {book_id: 0 for book_id in TAGNT_TO_DAVAR.values()}
    for token in tokens:
        counts[token.davar_book] += 1
    return {
        "absent_verses": absent,
        "book_count": len(books),
        "expected_book_count": BESORAH_BOOK_COUNT,
        "sbl_token_counts": counts,
        "token_count": len(tokens),
    }


def build_bundle(tagnt_texts: list[str], tbesg_text: str) -> dict:
    tokens: list[TagntToken] = []
    amalgam_rows: list[dict[str, str]] = []
    for text in tagnt_texts:
        tokens.extend(parse_tagnt_file(text))
        for line in text.splitlines():
            if "\t" not in line or "=" not in line or "#" not in line:
                continue
            cols = line.split("\t")
            if len(cols) < 6:
                continue
            try:
                parse_word_ref(cols[0])
            except ValueError:
                continue
            amalgam_rows.append({"ref": cols[0], "editions": cols[5]})
    detected_absent = verses_without_sbl(amalgam_rows) if amalgam_rows else []
    absent = list(dict.fromkeys([*TAGNT_SBL_ABSENT_VERSES, *detected_absent]))
    books = group_verses(tokens)
    entries = parse_tbesg_file(tbesg_text)
    return {
        "books": books,
        "coverage": coverage_payload(tokens, absent, books),
        "lexicon": lexicon_payload(entries),
        "modifications": modifications_markdown(absent, list(books)),
        "occurrences": build_occurrences(tokens),
        "source": source_record(),
        "tokens": tokens,
    }


def write_bundle(bundle: dict, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "source.json", bundle["source"])
    write_json(output_dir / "coverage.json", bundle["coverage"])
    write_json(output_dir / "lexicon.json", bundle["lexicon"])
    write_json(output_dir / "occurrences.json", bundle["occurrences"])
    (output_dir / "MODIFICATIONS.md").write_text(bundle["modifications"], encoding="utf-8")
    books_dir = output_dir / "books"
    for book_id, verses in bundle["books"].items():
        write_json(
            books_dir / f"{book_id}.json",
            {
                "book_id": book_id,
                "edition": READING_EDITION,
                "source_revision": STEPBIBLE_COMMIT,
                "tagging": TAGGING_SOURCE,
                "tagnt_book": next(
                    code for code, davar in TAGNT_TO_DAVAR.items() if davar == book_id
                ),
                "verses": verses,
            },
        )
    return output_dir


def import_from_paths(tagnt_paths: list[Path], tbesg_path: Path, output_dir: Path) -> Path:
    texts = [path.read_text(encoding="utf-8") for path in tagnt_paths]
    return write_bundle(build_bundle(texts, tbesg_path.read_text(encoding="utf-8")), output_dir)


def default_source_paths(source_dir: Path) -> tuple[list[Path], Path]:
    tagnt = [source_dir / source.filename for source in TAGNT_SOURCES]
    tbesg = source_dir / "TBESG.txt"
    missing = [str(path) for path in (*tagnt, tbesg) if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing official sources: " + ", ".join(missing))
    return tagnt, tbesg


def bundle_bytes(bundle: dict) -> str:
    """Canonical payload used to prove rebuilds are byte-stable."""
    return dumps(
        {
            "books": bundle["books"],
            "coverage": bundle["coverage"],
            "lexicon": bundle["lexicon"],
            "occurrences": bundle["occurrences"],
            "source": bundle["source"],
        }
    )


def book_id_for_tagnt(tagnt_book: str) -> str:
    return davar_book_id(tagnt_book)
