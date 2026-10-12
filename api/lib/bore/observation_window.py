"""Determine the earliest new-month polling window using the observed month."""
import json
import sys
from datetime import date, timedelta

from calendar.services.sunset import sunset_on


def observation_window_opens(starts_on_evening):
    # A lunar month can end after 29 days. Keep polling until a new sighting
    # replaces this month start, including delayed publication of the report.
    earliest_last_day = starts_on_evening + timedelta(days=29)
    return sunset_on(earliest_last_day, 31.78, 35.23, "Asia/Jerusalem") - timedelta(minutes=30)


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    opens_at = observation_window_opens(date.fromisoformat(payload["starts_on_evening"]))
    json.dump({"opens_at": opens_at.isoformat()}, sys.stdout)
