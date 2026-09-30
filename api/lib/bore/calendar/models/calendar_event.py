from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CalendarEvent:
    event_id: str
    data: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"event_id": self.event_id}
        if self.data:
            payload["data"] = dict(self.data)
        return payload
