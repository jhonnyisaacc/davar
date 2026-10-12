from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from calendar.localization.i18n import Localization, load_localization
from calendar.models.biblical_month import BiblicalMonth
from calendar.models.calendar_day import CalendarDay
from calendar.models.enums import SourceStatus
from calendar.models.month_confirmation import MonthConfirmation
from calendar.paths import OUTPUT_DIR
from calendar.services.aviv_policy import AvivDecision

SCHEMA_VERSION = 1


class CalendarSerializer:
    def __init__(self, localization: Localization | None = None):
        self.localization = localization or load_localization()

    def serialize(
        self,
        *,
        months: tuple[BiblicalMonth, ...],
        days: dict[date, CalendarDay],
        confirmations: tuple[MonthConfirmation, ...],
        decision: AvivDecision,
        generated_at: datetime | None = None,
        source_status: SourceStatus = SourceStatus.OK,
    ) -> dict[str, Any]:
        generated = generated_at or datetime.now(timezone.utc)
        payload = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated.astimezone(timezone.utc).isoformat(),
            "source_status": source_status.value,
            "year_start_status": decision.status.value,
            "year_start_note": decision.note,
            "locales": self.localization.bundle(),
            "months": [_month_payload(month, confirmations) for month in months],
            "days": {
                day.isoformat(): _day_payload(days[day])
                for day in sorted(days)
            },
        }
        return payload

    def write(self, payload: dict[str, Any], path: Path | None = None) -> Path:
        destination = path or (OUTPUT_DIR / "calendar.json")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
            encoding="utf-8",
        )
        return destination


def _month_payload(month: BiblicalMonth, confirmations: tuple[MonthConfirmation, ...]) -> dict[str, Any]:
    confirmation = next((item for item in confirmations if item.id == month.confirmation_id), None)
    payload: dict[str, Any] = {
        "status": month.status.value,
        "starts_on_evening": month.starts_on_evening.isoformat(),
        "first_daytime": month.first_daytime.isoformat(),
        "last_daytime": month.last_daytime.isoformat() if month.last_daytime else None,
        "month_id": month.month_id,
        "month_ordinal": month.month_ordinal,
        "year_start_status": month.year_start_status.value,
        "day_count": month.day_count,
    }
    if confirmation:
        payload["provenance"] = {
            "source": confirmation.source.value,
            "source_entry_id": confirmation.source_entry_id,
            "source_url": confirmation.source_url,
            "observers": list(confirmation.observers),
            "locations": list(confirmation.locations),
            "unaided": confirmation.unaided,
            "ingested_at": confirmation.ingested_at.isoformat(),
            "observation_ids": list(confirmation.observation_ids),
            "reason": confirmation.reason,
        }
    return payload


def _day_payload(day: CalendarDay) -> dict[str, Any]:
    return {
        "biblical": day.biblical.display_parts(),
        "rabbinic": {
            "day": day.rabbinic.day,
            "month_id": day.rabbinic.month_id,
            "year": day.rabbinic.year,
        },
        "events": [event.event_id for event in day.events],
        "event_details": [event.to_dict() for event in day.events],
        "month_status": day.month_status.value,
        "year_start_status": day.year_start_status.value,
        "confirmation_id": day.confirmation_id,
    }
