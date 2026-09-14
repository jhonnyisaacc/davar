"""Custom / own-concept definitions: custom_definitions.json."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.translate.adapters.lexicon import (
    apply_text_fields,
    iter_definition_jobs,
    load_store_json,
    write_store_json,
)
from scripts.translate.engine import TranslateJob

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONCEPTS = ROOT / "data" / "dict" / "lexicon" / "custom_definitions.json"


class ConceptsAdapter:
    name = "concepts"
    extra_instruction = (
        "These are Davar's own Hebrew concept glosses. "
        "Keep the theological sense; do not flatten names of God."
    )

    def __init__(self, paths: list[Path] | None = None) -> None:
        self.paths = paths or ([DEFAULT_CONCEPTS] if DEFAULT_CONCEPTS.is_file() else [])

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
                raise ValueError(f"{path} is not a concepts object")
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
