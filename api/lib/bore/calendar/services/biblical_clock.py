from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from calendar.models.calendar_day import CalendarDay
from calendar.services.sunset import sunset_on


def biblical_lookup_date(
    instant: datetime,
    latitude: float,
    longitude: float,
    timezone: str,
) -> date:
    """Civil date key for the Biblical day that contains `instant` locally.

    After local sunset the Biblical day has already rolled, so the lookup
    key is the following civil morning.
    """
    tz = ZoneInfo(timezone)
    local = instant.astimezone(tz)
    sunset = sunset_on(local.date(), latitude, longitude, timezone)
    if local >= sunset:
        return local.date() + timedelta(days=1)
    return local.date()


def biblical_date_at(
    instant: datetime,
    latitude: float,
    longitude: float,
    timezone: str,
    days: dict[date, CalendarDay],
) -> CalendarDay | None:
    lookup = biblical_lookup_date(instant, latitude, longitude, timezone)
    return days.get(lookup)
