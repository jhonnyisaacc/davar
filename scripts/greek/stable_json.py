"""Byte-stable JSON for reproducible Greek importer artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def dumps(payload: Any, *, compact: bool = False) -> str:
    if compact:
        return (
            json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n"
        )
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_json(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(payload, compact=compact), encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))
