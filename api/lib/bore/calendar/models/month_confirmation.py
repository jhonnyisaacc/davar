from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from calendar.models.enums import MonthStatus, NewMoonSource


@dataclass(frozen=True)
class MonthConfirmation:
    id: str
    status: MonthStatus
    observed_on: date
    starts_on_evening: date
    source: NewMoonSource
    source_entry_id: str
    source_url: str
    observation_ids: tuple[str, ...]
    observers: tuple[str, ...]
    locations: tuple[str, ...]
    unaided: bool
    ingested_at: datetime
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status.value,
            "observed_on": self.observed_on.isoformat(),
            "starts_on_evening": self.starts_on_evening.isoformat(),
            "source": self.source.value,
            "source_entry_id": self.source_entry_id,
            "source_url": self.source_url,
            "observation_ids": list(self.observation_ids),
            "observers": list(self.observers),
            "locations": list(self.locations),
            "unaided": self.unaided,
            "ingested_at": self.ingested_at.isoformat(),
            "reason": self.reason,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> MonthConfirmation:
        return cls(
            id=payload["id"],
            status=MonthStatus(payload["status"]),
            observed_on=date.fromisoformat(payload["observed_on"]),
            starts_on_evening=date.fromisoformat(payload["starts_on_evening"]),
            source=NewMoonSource(payload["source"]),
            source_entry_id=payload["source_entry_id"],
            source_url=payload["source_url"],
            observation_ids=tuple(payload.get("observation_ids", ())),
            observers=tuple(payload.get("observers", ())),
            locations=tuple(payload.get("locations", ())),
            unaided=bool(payload["unaided"]),
            ingested_at=datetime.fromisoformat(payload["ingested_at"]),
            reason=payload.get("reason", ""),
        )
