"""Content-addressed translation cache. Survives rebuilds of source stores."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

CACHE_SCHEMA = "davar-translate-cache-v1"


def source_hash(*parts: str) -> str:
    payload = "\n".join(parts).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def empty_cache() -> dict[str, Any]:
    return {
        "items": {},
        "model": None,
        "schema": CACHE_SCHEMA,
        "usage": {"completion_tokens": 0, "prompt_tokens": 0},
    }


def load_cache(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return empty_cache()
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema") != CACHE_SCHEMA or not isinstance(
        payload.get("items"), dict
    ):
        return empty_cache()
    payload.setdefault("usage", {"completion_tokens": 0, "prompt_tokens": 0})
    return payload


def save_cache(path: Path, cache: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


class DebouncedCache:
    """Flush cache to disk every N updates or after a quiet interval."""

    def __init__(
        self,
        path: Path,
        cache: dict[str, Any],
        *,
        every: int = 8,
        interval: float = 2.0,
    ) -> None:
        self.path = path
        self.cache = cache
        self.every = max(1, every)
        self.interval = interval
        self._pending = 0
        self._last_flush = 0.0

    def mark(self) -> None:
        self._pending += 1
        now = time.monotonic()
        if self._pending >= self.every or now - self._last_flush >= self.interval:
            self.flush()

    def flush(self) -> None:
        if self._pending == 0:
            return
        save_cache(self.path, self.cache)
        self._pending = 0
        self._last_flush = time.monotonic()
