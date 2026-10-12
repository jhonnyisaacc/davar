"""Conventional fixed arithmetical rabbinic (Hebrew) calendar.

This is secondary reference data. It is never used to name Biblical months.
"""

from __future__ import annotations

from datetime import date

RABBINIC_MONTH_IDS = (
    "nisan",
    "iyar",
    "sivan",
    "tammuz",
    "av",
    "elul",
    "tishrei",
    "cheshvan",
    "kislev",
    "tevet",
    "shevat",
    "adar",
    "adar_ii",
)

# Rata Die of 1 Tishrei AM 1, matching datetime.date.toordinal() epoch.
_HEBREW_EPOCH = -1373427


def gregorian_to_rabbinic(civil: date) -> tuple[int, str, int]:
    rd = civil.toordinal()
    year = int((rd - _HEBREW_EPOCH) / 365.2468) + 1
    while _hebrew_new_year(year + 1) <= rd:
        year += 1
    while _hebrew_new_year(year) > rd:
        year -= 1
    month = 7  # Tishrei
    while rd > _hebrew_month_end(year, month):
        month = _next_hebrew_month(year, month)
    day = rd - _hebrew_month_start(year, month) + 1
    return year, _month_id(year, month), day


def _is_leap(year: int) -> bool:
    return ((7 * year + 1) % 19) < 7


def _elapsed_days(year: int) -> int:
    months_elapsed = (235 * year - 234) // 19
    parts_elapsed = 12084 + 13753 * months_elapsed
    day = 29 * months_elapsed + parts_elapsed // 25920
    if (3 * (day + 1)) % 7 < 3:
        day += 1
    return day


def _new_year_delay(year: int) -> int:
    this_year = _elapsed_days(year)
    next_year = _elapsed_days(year + 1)
    if next_year - this_year == 356:
        return 2
    previous = _elapsed_days(year - 1)
    if this_year - previous == 382:
        return 1
    return 0


def _hebrew_new_year(year: int) -> int:
    return _HEBREW_EPOCH + _elapsed_days(year) + _new_year_delay(year)


def _year_length(year: int) -> int:
    return _hebrew_new_year(year + 1) - _hebrew_new_year(year)


def _months_in_year(year: int) -> int:
    return 13 if _is_leap(year) else 12


def _month_length(year: int, month: int) -> int:
    if month in {2, 4, 6, 10, 13}:
        return 29
    if month in {1, 3, 5, 7, 11}:
        return 30
    if month == 12:
        return 30 if _is_leap(year) else 29
    if month == 8:  # Cheshvan
        return 30 if _year_length(year) in {355, 385} else 29
    if month == 9:  # Kislev
        return 29 if _year_length(year) in {353, 383} else 30
    raise ValueError(f"Unknown Hebrew month {month}")


def _next_hebrew_month(year: int, month: int) -> int:
    if month == 6:
        return 7
    if month == 12:
        return 13 if _is_leap(year) else 1
    if month == 13:
        return 1
    return month + 1


def _hebrew_month_start(year: int, month: int) -> int:
    start = _hebrew_new_year(year)
    current = 7
    while current != month:
        start += _month_length(year, current)
        current = _next_hebrew_month(year, current)
    return start


def _hebrew_month_end(year: int, month: int) -> int:
    return _hebrew_month_start(year, month) + _month_length(year, month) - 1


def _month_id(year: int, month: int) -> str:
    if month == 12 and _is_leap(year):
        return "adar"
    if month == 13:
        return "adar_ii"
    # month numbers: 1 Nisan ... 12 Adar / 13 Adar II, 7 Tishrei
    index = month - 1
    if month == 12 and not _is_leap(year):
        return "adar"
    return RABBINIC_MONTH_IDS[index]
