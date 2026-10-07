from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, time
from typing import Any

from calendar.models.enums import NewMoonSource, VisibilityMethod


@dataclass(frozen=True)
class NewMoonObservation:
    id: str
    source: NewMoonSource
    source_entry_id: str
    source_url: str
    observed_on: date
    observed_at: time | None
    observer: str
    location: str
    country: str
    visibility_method: VisibilityMethod
    verified: bool
    raw_source_hash: str
    fetched_at: datetime

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["source"] = self.source.value
        payload["visibility_method"] = self.visibility_method.value
        payload["observed_on"] = self.observed_on.isoformat()
        payload["observed_at"] = self.observed_at.isoformat() if self.observed_at else None
        payload["fetched_at"] = self.fetched_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> NewMoonObservation:
        observed_at = payload.get("observed_at")
        return cls(
            id=payload["id"],
            source=NewMoonSource(payload["source"]),
            source_entry_id=payload["source_entry_id"],
            source_url=payload["source_url"],
            observed_on=date.fromisoformat(payload["observed_on"]),
            observed_at=time.fromisoformat(observed_at) if observed_at else None,
            observer=payload["observer"],
            location=payload["location"],
            country=payload["country"],
            visibility_method=VisibilityMethod(payload["visibility_method"]),
            verified=bool(payload["verified"]),
            raw_source_hash=payload["raw_source_hash"],
            fetched_at=datetime.fromisoformat(payload["fetched_at"]),
        )
