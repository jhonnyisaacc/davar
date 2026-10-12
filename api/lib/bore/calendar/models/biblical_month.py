from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from calendar.models.enums import MonthStatus, YearStartStatus


@dataclass(frozen=True)
class BiblicalMonth:
    confirmation_id: str | None
    status: MonthStatus
    starts_on_evening: date
    first_daytime: date
    last_daytime: date | None
    month_id: str | None
    month_ordinal: int | None
    year_start_status: YearStartStatus
    day_count: int | None
