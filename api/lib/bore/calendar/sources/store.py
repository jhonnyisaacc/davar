from __future__ import annotations

import json
from pathlib import Path

from calendar.models.month_confirmation import MonthConfirmation
from calendar.models.new_moon_observation import NewMoonObservation
from calendar.models.source_entry import SourceEntry
from calendar.paths import STORE_DIR


class CalendarStore:
    def __init__(self, root: Path | None = None):
        self.root = root or STORE_DIR
        self.root.mkdir(parents=True, exist_ok=True)
        self.entries_path = self.root / "source_entries.json"
        self.observations_path = self.root / "observations.json"
        self.confirmations_path = self.root / "month_confirmations.json"

    def load_entries(self) -> dict[str, SourceEntry]:
        return {
            item.source_entry_id: item
            for item in self._load_list(self.entries_path, SourceEntry.from_dict)
        }

    def load_observations(self) -> dict[str, NewMoonObservation]:
        return {
            item.id: item
            for item in self._load_list(self.observations_path, NewMoonObservation.from_dict)
        }

    def load_confirmations(self) -> dict[str, MonthConfirmation]:
        return {
            item.id: item
            for item in self._load_list(self.confirmations_path, MonthConfirmation.from_dict)
        }

    def save_entries(self, entries: dict[str, SourceEntry]) -> None:
        self._save_list(self.entries_path, [entries[key].to_dict() for key in sorted(entries)])

    def save_observations(self, observations: dict[str, NewMoonObservation]) -> None:
        self._save_list(
            self.observations_path,
            [observations[key].to_dict() for key in sorted(observations)],
        )

    def save_confirmations(self, confirmations: dict[str, MonthConfirmation]) -> None:
        self._save_list(
            self.confirmations_path,
            [confirmations[key].to_dict() for key in sorted(confirmations)],
        )

    def _load_list(self, path: Path, factory):
        if not path.exists():
            return []
        payload = json.loads(path.read_text(encoding="utf-8"))
        return [factory(item) for item in payload]

    def _save_list(self, path: Path, items: list[dict]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
