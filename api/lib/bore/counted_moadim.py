"""Davar's explicit weekly-Shabbat and inclusive fifty-day counting rule."""
from datetime import timedelta

from calendar.models.enums import MonthStatus

WEEKLY_SHABBAT_RULE = "weekly_shabbat_during_hag_hamatzot"


def counted_moadim_dates(confirmations, identities, rule):
    if rule is None:
        return {}
    if rule != WEEKLY_SHABBAT_RULE:
        raise ValueError("Unsupported wave-sheaf rule")
    dates = {}
    for confirmation in confirmations:
        identity = identities.get(confirmation.starts_on_evening)
        if confirmation.status != MonthStatus.CONFIRMED or not identity or identity["month_ordinal"] != 1:
            continue
        # Aviv 15 is the first daytime of Jag HaMatzot. The next weekly
        # Shabbat falls within its seven days; Bikurim follows that Shabbat.
        first_matzot_day = confirmation.starts_on_evening + timedelta(days=15)
        weekly_shabbat = first_matzot_day + timedelta(days=(5 - first_matzot_day.weekday()) % 7)
        bikurim = weekly_shabbat + timedelta(days=1)
        for event, civil, count in (("bikurim", bikurim, 1), ("shavuot", bikurim + timedelta(days=49), 50)):
            dates.setdefault(civil, []).append({
                "event_id": event, "status": "calculated", "rule": rule,
                "day_of_count": count, "wave_sheaf_civil_date": bikurim.isoformat(),
                "aviv_starts_on_evening": confirmation.starts_on_evening.isoformat(),
                "confirmation_id": confirmation.id, "source_url": identity["source_url"],
            })
    return dates
