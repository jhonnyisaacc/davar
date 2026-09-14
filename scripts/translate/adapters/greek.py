"""Greek definition drafts. Reuses TBESG/UBS protection from scripts.greek."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.translate.engine import TranslateJob

ROOT = Path(__file__).resolve().parents[3]


def _to_greek_cache(cache: dict[str, Any]) -> dict[str, Any]:
    items: dict[str, Any] = {}
    for key, item in (cache.get("items") or {}).items():
        if not isinstance(item, dict):
            continue
        items[key] = {
            "fuller": item.get("extra")
            or item.get("fuller")
            or item.get("text")
            or item.get("short")
            or "",
            "model": item.get("model") or cache.get("model"),
            "short": item.get("text")
            or item.get("short")
            or item.get("extra")
            or item.get("fuller")
            or "",
            "source_text_hash": item.get("source_text_hash") or key,
        }
    return {
        "items": items,
        "model": cache.get("model"),
        "schema": cache.get("schema"),
    }


def _default_definitions_dir() -> Path:
    from scripts.greek.sources import STEPBIBLE_COMMIT
    from scripts.greek.translate import DEFAULT_DEFINITIONS_DIR

    return DEFAULT_DEFINITIONS_DIR if DEFAULT_DEFINITIONS_DIR.is_dir() else (
        ROOT / "data" / "greek" / "definitions" / STEPBIBLE_COMMIT
    )


class GreekAdapter:
    name = "greek"
    extra_instruction = ""

    def __init__(self, definitions_dir: Path | None = None) -> None:
        self.definitions_dir = definitions_dir or _default_definitions_dir()
        self.store_path = self.definitions_dir / "definitions.json"

    def collect(
        self,
        targets: tuple[str, ...],
        cache: dict[str, Any] | None = None,
        force: bool = False,
    ) -> list[TranslateJob]:
        from scripts.greek.translate import collect_jobs, load_cache
        from scripts.greek.stable_json import read_json

        if not self.store_path.is_file():
            raise FileNotFoundError(
                f"Missing {self.store_path}. Run `python -m scripts.greek define` first."
            )
        store = read_json(self.store_path)
        if cache is None:
            cache = load_cache(self.definitions_dir / "translation-cache.json")
        greek_cache = _to_greek_cache(cache)
        jobs = collect_jobs(store, targets, greek_cache, force=force)
        converted: list[TranslateJob] = []
        for job in jobs:
            converted.append(
                TranslateJob(
                    item_id=f"{job.target}:{job.sense_id}",
                    cache_key=job.cache_key,
                    target=job.target,
                    text=job.short,
                    extra=job.fuller,
                    meta={
                        "entry_id": job.entry_id,
                        "lemma": job.lemma,
                        "sense_id": job.sense_id,
                        "source": self.name,
                    },
                )
            )
        return converted

    def apply(
        self,
        cache: dict[str, Any],
        targets: tuple[str, ...],
        *,
        write: bool = False,
    ) -> int:
        from scripts.greek.definitions import write_definitions
        from scripts.greek.stable_json import read_json
        from scripts.greek.translate import apply_translation_cache

        if not self.store_path.is_file():
            raise FileNotFoundError(self.store_path)
        store = read_json(self.store_path)
        greek_cache = _to_greek_cache(cache)
        apply_translation_cache(store, greek_cache)
        applied = 0
        for entry in (store.get("entries") or {}).values():
            for sense in entry.get("senses") or []:
                for target in targets:
                    current = (sense.get("definitions") or {}).get(target) or {}
                    if current.get("short") or current.get("fuller"):
                        applied += 1
        if write:
            write_definitions(store, self.definitions_dir)
        return applied
