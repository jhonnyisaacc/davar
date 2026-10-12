from datetime import date
from types import SimpleNamespace

from calendar.models.enums import MonthStatus
from counted_moadim import WEEKLY_SHABBAT_RULE, counted_moadim_dates


def confirmation(start, status=MonthStatus.CONFIRMED):
    return SimpleNamespace(id="aviv-confirmation", starts_on_evening=start, status=status)


def identity(start):
    return {start: {"month_ordinal": 1, "source_url": "https://example.test/aviv-witnesses"}}


def test_2026_count_uses_confirmed_aviv_even_when_a_later_month_sighting_is_missing():
    start = date(2026, 3, 20)
    events = counted_moadim_dates([confirmation(start)], identity(start), WEEKLY_SHABBAT_RULE)
    assert set(events) == {date(2026, 4, 5), date(2026, 5, 24)}
    assert events[date(2026, 4, 5)][0]["event_id"] == "bikurim"
    shavuot = events[date(2026, 5, 24)][0]
    assert shavuot["event_id"] == "shavuot"
    assert shavuot["day_of_count"] == 50
    assert shavuot["wave_sheaf_civil_date"] == "2026-04-05"
    assert shavuot["confirmation_id"] == "aviv-confirmation"


def test_retracted_or_unidentified_aviv_cannot_supply_counted_festivals():
    start = date(2026, 3, 20)
    assert counted_moadim_dates([confirmation(start, MonthStatus.PENDING)], identity(start), WEEKLY_SHABBAT_RULE) == {}
    assert counted_moadim_dates([confirmation(start)], {}, WEEKLY_SHABBAT_RULE) == {}
    assert counted_moadim_dates([confirmation(start)], identity(start), None) == {}


def test_weekly_shabbat_rule_is_not_a_fixed_aviv_sixteenth_day():
    start = date(2024, 3, 11)
    events = counted_moadim_dates([confirmation(start)], identity(start), WEEKLY_SHABBAT_RULE)
    assert set(events) == {date(2024, 3, 31), date(2024, 5, 19)}
    assert (date(2024, 3, 31) - start).days == 20
