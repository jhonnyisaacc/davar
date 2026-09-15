#!/usr/bin/env python3
"""Import the permitted Torah con Yehoshua custom dictionaries.

The importer consumes the site's JSON assets instead of scraping rendered HTML.
It keeps the source row identity on every imported definition, resolves exact
Greek/Hebrew matches to Davar Strong IDs, and gives unresolved rows stable D
fallback IDs.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
RAW_ROOT = ROOT / "data/dict/raw/tcysite"
CUSTOM_PATH = ROOT / "data/dict/lexicon/custom_definitions.json"
WORDS_PATH = ROOT / "data/dict/lexicon/words.json"
ROOTS_PATH = ROOT / "data/dict/lexicon/roots.json"
GREEK_RELEASE_ROOT = ROOT / "data/greek/preview/greek/releases/sblgnt"
REPORT_PATH = ROOT / "data/dict/reports/tcysite_import.json"

ERIC_URLS = {
    "parashot": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_parashot.json",
    "salmos": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_salmos.json",
    "qohelet": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_qohelet.json",
    "shir_hashirim": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_shir_hashirim.json",
    "juan": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_Juan.json",
    "1tesalonicenses": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_1tesalonicenses.json",
    "2tesalonicenses": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_2tesalonicenses.json",
    "efesios": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_efesios.json",
    "apocalipsis": "https://www.torah-con-yehoshua-hamashiaj.com/dic/Diccionarioboton/diccionario_apocalipsis.json",
}

GREEK_MASTER_URL = "https://www.torah-con-yehoshua-hamashiaj.com/diccionario/masterdiccionario.json"
GREEK_INDEX_URL = "https://www.torah-con-yehoshua-hamashiaj.com/diccionario/strongs-greek-chavez.index.min.json"
GREEK_SHARD_BASE_URL = "https://www.torah-con-yehoshua-hamashiaj.com/diccionario/strongs-greek-chavez.shards"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def download(url: str, path: Path) -> None:
    request = Request(url, headers={"User-Agent": "Davar TCY dictionary importer"})
    with urlopen(request, timeout=60) as response:
        payload = response.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def source_manifest(source_root: Path) -> dict[str, Any]:
    files = []
    for path in sorted(source_root.rglob("*.json")):
        if path.name == "source_manifest.json":
            continue
        files.append(
            {
                "path": str(path.relative_to(source_root)),
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            }
        )
    return {
        "schema_version": 1,
        "source": "Torah con Yehoshua' Hamashiaj",
        "attribution": "Eric de Jesus Rodríguez, Diccionario Teológico Bíblico por contextos",
        "permission": "Permission to use the definitions and dictionary content was provided to the Davar project owner.",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "urls": {"eric": ERIC_URLS, "greek_master": GREEK_MASTER_URL, "greek_index": GREEK_INDEX_URL},
        "files": files,
    }


def fetch_sources(source_root: Path, refresh: bool = False) -> None:
    for slug, url in ERIC_URLS.items():
        path = source_root / "eric" / f"{slug}.json"
        if refresh or not path.exists():
            download(url, path)

    master_path = source_root / "greek" / "masterdiccionario.json"
    index_path = source_root / "greek" / "strongs-greek-chavez.index.min.json"
    if refresh or not master_path.exists():
        download(GREEK_MASTER_URL, master_path)
    if refresh or not index_path.exists():
        download(GREEK_INDEX_URL, index_path)

    index = read_json(index_path)
    shards = sorted(
        {
            str(row[4])
            for row in (index.get("e") or {}).values()
            if isinstance(row, list) and len(row) > 4 and row[4]
        }
    )
    for shard in shards:
        path = source_root / "greek" / "shards" / f"{shard}.min.json"
        if refresh or not path.exists():
            download(f"{GREEK_SHARD_BASE_URL}/{shard}.min.json", path)

    write_json(source_root / "source_manifest.json", source_manifest(source_root))


def normalize_term(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).lower()
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("ς", "σ")
    return "".join(char for char in text if char.isalnum())


def classify_term(value: Any) -> str:
    text = str(value or "")
    if any("\u0370" <= char <= "\u03ff" or "\u1f00" <= char <= "\u1fff" for char in text):
        return "greek"
    if any("\u0590" <= char <= "\u05ff" for char in text):
        return "hebrew"
    return "unknown"


def clean_html(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<p\s*/?>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<a\b[^>]*>(.*?)</a>", r"\1", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"[ \t]+", " ", text).strip()


def strong_core(value: str) -> tuple[int, str] | None:
    match = re.fullmatch(r"G0*(\d+)([A-Za-z]?)", str(value))
    if not match:
        return None
    return int(match.group(1)), match.group(2).upper()


def build_greek_key_index(current_keys: set[str]) -> dict[tuple[int, str], set[str]]:
    index: dict[tuple[int, str], set[str]] = defaultdict(set)
    for key in current_keys:
        parsed = strong_core(key)
        if parsed:
            index[parsed].add(key)
            index[(parsed[0], "")].add(key)
    return index


def canonical_greek_key(
    site_strong: str, current_index: dict[tuple[int, str], set[str]]
) -> str | None:
    parsed = strong_core(site_strong)
    if not parsed:
        return None
    number, suffix = parsed
    candidates = set()
    if suffix:
        candidates.update(current_index.get((number, suffix), set()))
    else:
        candidates.update(current_index.get((number, ""), set()))
    if len(candidates) == 1:
        return next(iter(candidates))
    return None


def build_term_index(entries: dict[str, Any], field_names: tuple[str, ...]) -> dict[str, set[str]]:
    result: dict[str, set[str]] = defaultdict(set)
    for strong, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        for field in field_names:
            value = entry.get(field)
            if value:
                result[normalize_term(value)].add(str(strong))
    return result


def add_definition(
    output: dict[str, Any],
    key: str,
    *,
    term: str,
    transliteration: str,
    language: str,
    text_es: str,
    context: str,
    source: str,
    source_file: str,
    source_row: str,
    source_url: str,
    original_id: Any = None,
    definition_kind: str = "definition",
) -> bool:
    if not text_es:
        text_es = context
        definition_kind = "observation" if text_es else definition_kind
    if not text_es:
        return False

    entry = output.setdefault(
        key,
        {
            "strong_number": key,
            "is_custom": True,
            "term_language": language,
            "canonical_strong": key if key[:1] in {"G", "H"} else None,
            "imported_by": "tcysite",
            "definitions": [],
        },
    )
    entry.setdefault("strong_number", key)
    entry.setdefault("is_custom", True)
    entry.setdefault("term_language", language)
    entry.setdefault("imported_by", "tcysite")
    definitions = entry.setdefault("definitions", [])
    duplicate_key = (source, source_file, source_row, text_es)
    if any(
        (
            item.get("source"),
            item.get("source_file"),
            item.get("source_row"),
            item.get("text_es"),
        )
        == duplicate_key
        for item in definitions
        if isinstance(item, dict)
    ):
        return False
    order = max((int(item.get("order", 0)) for item in definitions if isinstance(item, dict)), default=0) + 1
    definition = {
        "source": source,
        "text_es": text_es,
        "order": order,
        "review_status": "imported",
        "license": "Permission-based use; see data/dict/raw/tcysite/source_manifest.json",
        "term_language": language,
        "source_file": source_file,
        "source_row": source_row,
        "source_url": source_url,
        "definition_kind": definition_kind,
    }
    if term:
        definition["term"] = term
    if transliteration:
        definition["transliteration"] = transliteration
    if context:
        definition["context"] = context
    if original_id is not None:
        definition["original_id"] = original_id
    definitions.append(definition)
    return True


def fallback_id(identity: str, used: set[str]) -> str:
    base = 1_000_000 + (int(hashlib.sha256(identity.encode()).hexdigest()[:12], 16) % 8_000_000)
    candidate = base
    while f"D{candidate}" in used:
        candidate += 1
        if candidate >= 9_000_000:
            candidate = 1_000_000
    result = f"D{candidate}"
    used.add(result)
    return result


def reset_imported(output: dict[str, Any]) -> None:
    remove = []
    for key, entry in output.items():
        if not isinstance(entry, dict):
            continue
        definitions = [
            item
            for item in entry.get("definitions", [])
            if not str(item.get("source", "")).startswith("tcysite-")
        ]
        entry["definitions"] = definitions
        if entry.get("imported_by") == "tcysite" and not definitions:
            remove.append(key)
    for key in remove:
        del output[key]


def import_data(source_root: Path) -> dict[str, Any]:
    output = read_json(CUSTOM_PATH)
    reset_imported(output)
    used_ids = set(output)
    manifest = read_json(source_root / "source_manifest.json")

    words = read_json(WORDS_PATH)
    roots = read_json(ROOTS_PATH)
    greek_path = sorted(GREEK_RELEASE_ROOT.glob("*/lexicon.json"))[-1]
    greek = read_json(greek_path)
    greek_keys = {str(key) for key in greek}
    greek_key_index = build_greek_key_index(greek_keys)

    hebrew_index = build_term_index({**roots, **words, **output}, ("hebrew", "lemma"))
    site_index = read_json(source_root / "greek" / "strongs-greek-chavez.index.min.json")
    greek_aliases = site_index.get("a") or {}
    greek_entries = site_index.get("e") or {}
    greek_lookup: dict[str, set[str]] = defaultdict(set)
    for alias, site_id in greek_aliases.items():
        greek_lookup[normalize_term(alias)].add(str(site_id))
    for site_id, row in greek_entries.items():
        if isinstance(row, list) and row:
            greek_lookup[normalize_term(row[0])].add(str(site_id))
            if len(row) > 1:
                greek_lookup[normalize_term(row[1])].add(str(site_id))

    stats: Counter[str] = Counter()
    duplicate_terms: Counter[str] = Counter()
    fallback_rows: list[dict[str, Any]] = []

    def resolve_greek(term: str, transliteration: str) -> tuple[str | None, bool]:
        candidates: set[str] = set()
        for value in (term, transliteration):
            candidates.update(greek_lookup.get(normalize_term(value), set()))
        canonical = {
            canonical_greek_key(site_id, greek_key_index) for site_id in candidates
        }
        canonical.discard(None)
        return (
            (next(iter(canonical)), False)
            if len(canonical) == 1
            else (None, len(canonical) > 1)
        )

    def resolve_hebrew(term: str) -> tuple[str | None, bool]:
        candidates = hebrew_index.get(normalize_term(term), set())
        return (
            (next(iter(candidates)), False)
            if len(candidates) == 1
            else (None, len(candidates) > 1)
        )

    def target_for(identity: str, language: str, term: str, transliteration: str) -> str:
        target, ambiguous = (
            resolve_greek(term, transliteration)
            if language == "greek"
            else resolve_hebrew(term)
        )
        if target:
            stats["matched_canonical"] += 1
            return target
        if ambiguous:
            stats["ambiguous"] += 1
        stats["unmatched"] += 1
        fallback = fallback_id(identity, used_ids)
        stats["fallback"] += 1
        fallback_rows.append({"identity": identity, "language": language, "term": term, "id": fallback})
        return fallback

    for slug, url in ERIC_URLS.items():
        rows = read_json(source_root / "eric" / f"{slug}.json")
        if not isinstance(rows, list):
            raise ValueError(f"Expected an array in Eric source {slug}")
        stats["eric_rows"] += len(rows)
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise ValueError(f"Invalid row {slug}[{index}]")
            term = str(row.get("texto_hebreo") or "").strip()
            transliteration = str(row.get("transliteracion") or "").strip()
            language = classify_term(term)
            stats[f"eric_{language}"] += 1
            duplicate_terms[normalize_term(term)] += 1
            meaning = str(row.get("equivalencia_espanol") or "").strip()
            context = str(row.get("observacion") or "").strip()
            if not meaning:
                stats["missing_spanish"] += 1
            key = target_for(f"eric:{slug}:{index}", language, term, transliteration)
            source = "tcysite-eric"
            if add_definition(
                output,
                key,
                term=term,
                transliteration=transliteration,
                language=language,
                text_es=meaning,
                context=context,
                source=source,
                source_file=f"eric/{slug}.json",
                source_row=str(index),
                source_url=url,
                original_id=row.get("id"),
            ):
                stats["definitions_added"] += 1

    for site_id, row in (site_index.get("e") or {}).items():
        if not isinstance(row, list) or len(row) < 4:
            continue
        lemma = str(row[0] or "")
        transliteration = str(row[1] or "")
        short_definition = str(row[3] or "")
        stats["greek_index_rows"] += 1
        target = target_for(f"greek-index:{site_id}", "greek", lemma, transliteration)
        if add_definition(
            output,
            target,
            term=lemma,
            transliteration=transliteration,
            language="greek",
            text_es=clean_html(short_definition),
            context="",
            source="tcysite-greek-strong",
            source_file="greek/strongs-greek-chavez.index.min.json",
            source_row=site_id,
            source_url=GREEK_INDEX_URL,
            original_id=site_id,
        ):
            stats["definitions_added"] += 1

        shard_name = str(row[4]) if len(row) > 4 else ""
        shard_path = source_root / "greek" / "shards" / f"{shard_name}.min.json"
        detail = read_json(shard_path).get("e", {}).get(site_id) if shard_path.exists() else None
        detail_text = clean_html(detail)
        if detail_text and detail_text != clean_html(short_definition):
            if add_definition(
                output,
                target,
                term=lemma,
                transliteration=transliteration,
                language="greek",
                text_es=detail_text,
                context="",
                source="tcysite-greek-detail",
                source_file=f"greek/shards/{shard_name}.min.json",
                source_row=site_id,
                source_url=f"{GREEK_SHARD_BASE_URL}/{shard_name}.min.json",
                original_id=site_id,
                definition_kind="lexical_detail",
            ):
                stats["definitions_added"] += 1

    master = read_json(source_root / "greek" / "masterdiccionario.json")
    for index, row in enumerate(master.get("items", [])):
        if not isinstance(row, dict):
            continue
        lemma = str(row.get("lemma") or "").strip()
        transliteration = str(row.get("Forma lexica") or "").strip()
        stats["greek_master_rows"] += 1
        target = target_for(f"greek-master:{index}", "greek", lemma, transliteration)
        if add_definition(
            output,
            target,
            term=lemma,
            transliteration=transliteration,
            language="greek",
            text_es=clean_html(row.get("definicion")),
            context=str(row.get("entrada_impresa") or "").strip(),
            source="tcysite-greek-master",
            source_file="greek/masterdiccionario.json",
            source_row=str(index),
            source_url=GREEK_MASTER_URL,
            original_id=row.get("Forma flexionada del texto"),
        ):
            stats["definitions_added"] += 1

    stats["duplicate_term_groups"] = sum(1 for count in duplicate_terms.values() if count > 1)
    stats["duplicate_term_rows"] = sum(count - 1 for count in duplicate_terms.values() if count > 1)
    stats["output_entries"] = len(output)
    stats["fallback_rows_reported"] = len(fallback_rows)

    write_json(CUSTOM_PATH, output)
    report = {
        "schema_version": 1,
        "generated_at": manifest.get("retrieved_at"),
        "source_manifest": "data/dict/raw/tcysite/source_manifest.json",
        "greek_release": str(greek_path.relative_to(ROOT)),
        "counts": dict(sorted(stats.items())),
        "fallback_rows": fallback_rows,
    }
    write_json(REPORT_PATH, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=RAW_ROOT)
    parser.add_argument("--fetch", action="store_true", help="Fetch missing TCY JSON assets")
    parser.add_argument("--refresh", action="store_true", help="Refetch all TCY JSON assets")
    args = parser.parse_args()
    source_dir = args.source_dir.resolve()
    if args.fetch or args.refresh:
        fetch_sources(source_dir, refresh=args.refresh)
    elif not (source_dir / "source_manifest.json").exists():
        raise SystemExit("Missing source manifest; run with --fetch first")
    report = import_data(source_dir)
    print(json.dumps(report["counts"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
