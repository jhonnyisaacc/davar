from datetime import date, timedelta

from calendar.services.sunset import sunset_on
from observation_window import observation_window_opens


def test_opens_before_sunset_on_earliest_lunar_month_end():
    opens = observation_window_opens(date(2026, 9, 12))
    assert opens.date() == date(2026, 10, 11)
    assert opens == sunset_on(date(2026, 10, 11), 31.78, 35.23, "Asia/Jerusalem") - timedelta(minutes=30)


def test_month_rollover_uses_israel_timezone():
    opens = observation_window_opens(date(2026, 10, 12))
    assert opens.date() == date(2026, 11, 10)
    assert opens.utcoffset() == timedelta(hours=2)
