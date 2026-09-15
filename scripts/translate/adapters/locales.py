"""App chrome adapter: locales/en.json leaves → locales/{lang}.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.translate.cache import source_hash
from scripts.translate.engine import TranslateJob

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_LOCALES_DIR = ROOT / "locales"


def flatten_leaves(
    payload: Any,
    prefix: str = "",
) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            rows.extend(flatten_leaves(value, path))
        return rows
    if isinstance(payload, str):
        rows.append((prefix, payload))
    return rows


def set_leaf(payload: dict[str, Any], path: str, value: str) -> None:
    parts = path.split(".")
    cursor: Any = payload
    for part in parts[:-1]:
        next_value = cursor.get(part)
        if not isinstance(next_value, dict):
            next_value = {}
            cursor[part] = next_value
        cursor = next_value
    cursor[parts[-1]] = value


def clone_empty(payload: Any) -> Any:
    if isinstance(payload, dict):
        return {key: clone_empty(value) for key, value in payload.items()}
    if isinstance(payload, str):
        return ""
    return payload


class LocalesAdapter:
    name = "locales"
    extra_instruction = (
        "These are short UI strings. Keep placeholders such as {count} unchanged. "
        "Match the tone of a contemplative Bible study app."
    )

    def __init__(
        self,
        locales_dir: Path | None = None,
        source_lang: str = "en",
    ) -> None:
        self.locales_dir = locales_dir or DEFAULT_LOCALES_DIR
        self.source_lang = source_lang
        self.source_path = self.locales_dir / f"{source_lang}.json"

    def _source(self) -> dict[str, Any]:
        return json.loads(self.source_path.read_text(encoding="utf-8"))

    def _target_path(self, lang: str) -> Path:
        return self.locales_dir / f"{lang}.json"

    def collect(
        self,
        targets: tuple[str, ...],
        cache: dict[str, Any] | None = None,
        force: bool = False,
    ) -> list[TranslateJob]:
        if not self.source_path.is_file():
            raise FileNotFoundError(self.source_path)
        source = self._source()
        leaves = flatten_leaves(source)
        items = (cache or {}).get("items", {})
        jobs: list[TranslateJob] = []
        for target in targets:
            existing: dict[str, str] = {}
            target_path = self._target_path(target)
            if target_path.is_file():
                existing = dict(flatten_leaves(json.loads(target_path.read_text(encoding="utf-8"))))
            for path, text in leaves:
                if not text.strip():
                    continue
                if not force and existing.get(path, "").strip():
                    continue
                key = source_hash(self.name, target, path, text)
                cached = items.get(key) or {}
                if not force and (cached.get("text") or cached.get("extra")):
                    continue
                jobs.append(
                    TranslateJob(
                        item_id=f"{target}:{path}",
                        cache_key=key,
                        target=target,
                        text=text,
                        meta={"path": path, "source": self.name},
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
        source = self._source()
        items = cache.get("items") or {}
        applied = 0
        for target in targets:
            target_path = self._target_path(target)
            if target_path.is_file():
                payload = json.loads(target_path.read_text(encoding="utf-8"))
            else:
                payload = clone_empty(source)
            for path, text in flatten_leaves(source):
                cached = items.get(source_hash(self.name, target, path, text))
                value = (cached or {}).get("text") or (cached or {}).get("extra")
                if not value:
                    continue
                set_leaf(payload, path, value)
                applied += 1
            if write:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
        return applied
