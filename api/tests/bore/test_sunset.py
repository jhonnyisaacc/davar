from datetime import datetime
from zoneinfo import ZoneInfo

from calendar.services.biblical_clock import biblical_lookup_date
from calendar.services.sunset import is_after_sunset, sunset_on

JERUSALEM = {"latitude": 31.7683, "longitude": 35.2137, "timezone": "Asia/Jerusalem"}
BOGOTA = {"latitude": 4.7110, "longitude": -74.0721, "timezone": "America/Bogota"}
NEW_YORK = {"latitude": 40.7128, "longitude": -74.0060, "timezone": "America/New_York"}


def test_before_and_after_sunset_jerusalem():
    from datetime import timedelta

    sunset = sunset_on(datetime(2026, 6, 21).date(), **JERUSALEM)
    assert sunset.tzinfo is not None
    assert 18 <= sunset.hour <= 20
    earlier = sunset - timedelta(minutes=1)
    later = sunset + timedelta(minutes=1)
    assert is_after_sunset(earlier, **JERUSALEM) is False
    assert is_after_sunset(later, **JERUSALEM) is True
    assert biblical_lookup_date(earlier, **JERUSALEM) == sunset.date()
    assert biblical_lookup_date(later, **JERUSALEM) == sunset.date() + timedelta(days=1)


def test_timezone_differences_change_the_lookup_date():
    # 21:00 UTC is after sunset in Jerusalem and still afternoon in Bogotá.
    instant = datetime(2026, 6, 21, 21, 0, tzinfo=ZoneInfo("UTC"))
    jerusalem_lookup = biblical_lookup_date(instant, **JERUSALEM)
    bogota_lookup = biblical_lookup_date(instant, **BOGOTA)
    assert jerusalem_lookup != bogota_lookup


def test_dst_boundary_uses_the_civil_offset_of_that_date():
    march = sunset_on(datetime(2026, 3, 20).date(), **NEW_YORK)
    november = sunset_on(datetime(2026, 11, 10).date(), **NEW_YORK)
    assert march.utcoffset() != november.utcoffset()
    assert 16 <= march.hour <= 20
    assert 16 <= november.hour <= 18
