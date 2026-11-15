import zoneinfo
from datetime import date, datetime, timezone

import pytest

from calendar.services.biblical_clock import biblical_lookup_date


@pytest.fixture
def no_system_zoneinfo():
    zoneinfo.reset_tzpath(to=[])
    zoneinfo.ZoneInfo.clear_cache()
    yield
    zoneinfo.reset_tzpath()
    zoneinfo.ZoneInfo.clear_cache()


def test_legacy_link_resolves_without_system_zoneinfo(no_system_zoneinfo):
    instant = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)
    assert biblical_lookup_date(instant, -34.6037, -58.3816, "America/Buenos_Aires") == date(2026, 9, 30)
