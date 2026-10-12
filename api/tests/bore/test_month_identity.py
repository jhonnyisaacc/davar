from datetime import date
from types import SimpleNamespace

from calendar.models.enums import MonthStatus
from month_identity import anchored_month_identities


ANCHOR = {
    "starts_on_evening": "2026-09-12", "month_ordinal": 7,
    "source_url": "https://example.test/seventh-month", "note": "Synthetic manual anchor",
}


def confirmation(iso, status=MonthStatus.CONFIRMED):
    return SimpleNamespace(starts_on_evening=date.fromisoformat(iso), status=status)


def test_explicit_anchor_numbers_only_continuous_confirmed_months():
    starts = ("2026-04-18", "2026-07-15", "2026-08-14", "2026-09-12", "2026-10-12")
    identities = anchored_month_identities(tuple(confirmation(iso) for iso in starts), [ANCHOR])
    assert {start.isoformat(): identity["month_ordinal"] for start, identity in identities.items()} == {
        "2026-07-15": 5, "2026-08-14": 6, "2026-09-12": 7, "2026-10-12": 8,
    }
    assert identities[date(2026, 10, 12)]["starts_on_evening"] == "2026-09-12"
    assert identities[date(2026, 9, 12)]["status"] == "manual"


def test_month_identity_requires_confirmation_of_its_anchor():
    assert anchored_month_identities((confirmation("2026-09-12", MonthStatus.PENDING),), [ANCHOR]) == {}
    assert anchored_month_identities((confirmation("2026-08-14"),), [ANCHOR]) == {}


def test_no_anchor_leaves_month_identity_unresolved():
    assert anchored_month_identities((confirmation("2026-09-12"),), []) == {}
