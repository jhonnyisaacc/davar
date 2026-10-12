from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from calendar.models.enums import NewMoonSource, SourceStatus


@dataclass(frozen=True)
class SourceEntry:
    source: NewMoonSource
    source_entry_id: str
    source_url: str
    title: str
    content_hash: str
    last_seen_at: datetime
    last_parsed_at: datetime | None
    parse_status: SourceStatus
    raw_content: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source.value,
            "source_entry_id": self.source_entry_id,
            "source_url": self.source_url,
            "title": self.title,
            "content_hash": self.content_hash,
            "last_seen_at": self.last_seen_at.isoformat(),
            "last_parsed_at": self.last_parsed_at.isoformat() if self.last_parsed_at else None,
            "parse_status": self.parse_status.value,
            # Full HTML is kept in fixtures, not in the working store.
            "raw_content": "",
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> SourceEntry:
        last_parsed = payload.get("last_parsed_at")
        return cls(
            source=NewMoonSource(payload["source"]),
            source_entry_id=payload["source_entry_id"],
            source_url=payload["source_url"],
            title=payload["title"],
            content_hash=payload["content_hash"],
            last_seen_at=datetime.fromisoformat(payload["last_seen_at"]),
            last_parsed_at=datetime.fromisoformat(last_parsed) if last_parsed else None,
            parse_status=SourceStatus(payload["parse_status"]),
            raw_content=payload.get("raw_content", ""),
        )
