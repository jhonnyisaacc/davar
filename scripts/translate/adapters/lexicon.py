"""Hebrew lexicon adapter: roots.json / words.json text_en → text_{lang}."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from scripts.translate.cache import source_hash
from scripts.translate.engine import TranslateJob

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ROOTS = ROOT / "data" / "dict" / "lexicon" / "roots.json"
DEFAULT_WORDS = ROOT / "data" / "dict" / "lexicon" / "words.json"


def load_store_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_store_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def english_text(definition: dict[str, Any]) -> str:
    return str(definition.get("text_en") or definition.get("text") or "").strip()


def target_field(lang: str) -> str:
    return f"text_{lang}"


def definition_filled(definition: dict[str, Any], lang: str) -> bool:
    value = definition.get(target_field(lang))
    return isinstance(value, str) and bool(value.strip())


def iter_definition_jobs(
    entries: dict[str, Any],
    targets: tuple[str, ...],
    *,
    cache: dict[str, Any] | None = None,
    source: str,
    force: bool = False,
    file_label: str = "",
) -> list[TranslateJob]:
    items = (cache or {}).get("items", {})
    jobs: list[TranslateJob] = []
    for entry_key, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        for index, definition in enumerate(entry.get("definitions") or []):
            if not isinstance(definition, dict):
                continue
            text = english_text(definition)
            if not text:
                continue
            order = definition.get("order", index + 1)
            for target in targets:
                if not force and definition_filled(definition, target):
                    continue
                key = source_hash(source, target, text)
                cached = items.get(key) or {}
                if not force and (cached.get("text") or cached.get("extra")):
                    continue
                jobs.append(
                    TranslateJob(
                        item_id=f"{file_label}{entry_key}:{order}",
                        cache_key=key,
                        target=target,
                        text=text,
                        meta={
                            "entry_key": entry_key,
                            "index": index,
                            "order": order,
                            "source": source,
                        },
                    )
                )
    return jobs


def apply_text_fields(
    entries: dict[str, Any],
    cache: dict[str, Any],
    targets: Iterable[str],
    *,
    source: str,
) -> int:
    items = cache.get("items") or {}
    applied = 0
    for entry in entries.values():
        if not isinstance(entry, dict):
            continue
        for definition in entry.get("definitions") or []:
            if not isinstance(definition, dict):
                continue
            text = english_text(definition)
            if not text:
                continue
            if "text" in definition and "text_en" not in definition:
                definition["text_en"] = definition.pop("text")
            for target in targets:
                cached = items.get(source_hash(source, target, text))
                value = (cached or {}).get("text") or (cached or {}).get("extra")
                if not value:
                    continue
                definition[target_field(target)] = value
                applied += 1
    return applied


class LexiconAdapter:
    name = "lexicon"
    extra_instruction = "Maintain technical accuracy and biblical terminology."

    def __init__(self, paths: list[Path] | None = None) -> None:
        if paths:
            self.paths = paths
        else:
            self.paths = [path for path in (DEFAULT_ROOTS, DEFAULT_WORDS) if path.is_file()]

    def collect(
        self,
        targets: tuple[str, ...],
        cache: dict[str, Any] | None = None,
        force: bool = False,
    ) -> list[TranslateJob]:
        jobs: list[TranslateJob] = []
        for path in self.paths:
            entries = load_store_json(path)
            if not isinstance(entries, dict):
                raise ValueError(f"{path} is not a lexicon object")
            jobs.extend(
                iter_definition_jobs(
                    entries,
                    targets,
                    cache=cache,
                    source=self.name,
                    force=force,
                    file_label=f"{path.stem}:",
                )
            )
        return jobs

    def apply(
        self,
        cache: dict[str, Any],
        targets: tuple[str, ...],
        *,
        write: bool = False,
    ) -> int:
        applied = 0
        for path in self.paths:
            entries = load_store_json(path)
            applied += apply_text_fields(entries, cache, targets, source=self.name)
            if write:
                write_store_json(path, entries)
        return applied
