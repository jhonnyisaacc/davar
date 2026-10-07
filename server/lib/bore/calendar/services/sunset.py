"""Local sunset using the NOAA solar-position approximation.

Consumers should call this service rather than hardcoding an hour.
"""

from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Apparent zenith for sunset including refraction and solar disk.
ZENITH_DEGREES = 90.833


def sunset_on(on_date: date, latitude: float, longitude: float, timezone: str) -> datetime:
    tz = ZoneInfo(timezone)
    minutes = _sunset_minutes(on_date, latitude, longitude, tz)
    hours = int(minutes // 60)
    mins = int(minutes % 60)
    seconds = int(round((minutes - hours * 60 - mins) * 60))
    if seconds == 60:
        seconds = 0
        mins += 1
    if mins == 60:
        mins = 0
        hours += 1
    if hours >= 24:
        overflow = hours - 23
        hours = 23
        mins = min(59, mins + overflow)
    return datetime.combine(on_date, time(hours, mins, max(0, seconds)), tzinfo=tz)


def is_after_sunset(
    instant: datetime,
    latitude: float,
    longitude: float,
    timezone: str,
) -> bool:
    tz = ZoneInfo(timezone)
    local = instant.astimezone(tz)
    return local >= sunset_on(local.date(), latitude, longitude, timezone)


def _sunset_minutes(on_date: date, latitude: float, longitude: float, tz: ZoneInfo) -> float:
    # NOAA formulas use the date's UTC offset at local noon.
    noon = datetime(on_date.year, on_date.month, on_date.day, 12, 0, tzinfo=tz)
    offset_hours = noon.utcoffset().total_seconds() / 3600 if noon.utcoffset() else 0.0
    n = on_date.timetuple().tm_yday
    gamma = (2.0 * math.pi / 365.0) * (n - 1 + (12 - 12) / 24.0)
    eqtime = 229.18 * (
        0.000075
        + 0.001868 * math.cos(gamma)
        - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2.0 * gamma)
        - 0.040849 * math.sin(2.0 * gamma)
    )
    decl = (
        0.006918
        - 0.399912 * math.cos(gamma)
        + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2.0 * gamma)
        + 0.000907 * math.sin(2.0 * gamma)
        - 0.002697 * math.cos(3.0 * gamma)
        + 0.00148 * math.sin(3.0 * gamma)
    )
    lat_rad = math.radians(latitude)
    cos_ha = (
        math.cos(math.radians(ZENITH_DEGREES)) / (math.cos(lat_rad) * math.cos(decl))
        - math.tan(lat_rad) * math.tan(decl)
    )
    if cos_ha <= -1:
        return 23 * 60 + 59
    if cos_ha >= 1:
        raise ValueError("Sun does not set on this date at the given latitude")
    ha_deg = math.degrees(math.acos(max(-1.0, min(1.0, cos_ha))))
    # NOAA: sunset uses (longitude - hour_angle); sunrise would add hour_angle.
    return 720.0 - 4.0 * (longitude - ha_deg) - eqtime + offset_hours * 60.0


def next_sunset_after(
    instant: datetime,
    latitude: float,
    longitude: float,
    timezone: str,
) -> datetime:
    tz = ZoneInfo(timezone)
    local = instant.astimezone(tz)
    candidate = sunset_on(local.date(), latitude, longitude, timezone)
    if local < candidate:
        return candidate
    return sunset_on(local.date() + timedelta(days=1), latitude, longitude, timezone)
