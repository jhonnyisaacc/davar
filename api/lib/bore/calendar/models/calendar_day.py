from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from calendar.models.biblical_date import BiblicalDate
from calendar.models.calendar_event import CalendarEvent
from calendar.models.enums import MonthStatus, YearStartStatus


@dataclass(frozen=True)
class RabbinicDate:
    day: int
    month_id: str
    year: int


@dataclass(frozen=True)
class CalendarDay:
    civil_date: date
    biblical: BiblicalDate
    rabbinic: RabbinicDate
    events: tuple[CalendarEvent, ...]
    month_status: MonthStatus
    year_start_status: YearStartStatus
    confirmation_id: str | None
