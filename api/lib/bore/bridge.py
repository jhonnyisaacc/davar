"""Rails-owned boundary over the pinned Bore domain; stdin/stdout JSON only."""
import json
import sys
from datetime import date, datetime, timedelta
from calendar.models.month_confirmation import MonthConfirmation
from calendar.services.calendar_builder import CalendarBuilder
from calendar.services.biblical_clock import biblical_lookup_date
from calendar.services.rabbinic_calendar import gregorian_to_rabbinic
from calendar.services.sunset import next_sunset_after

payload = json.load(sys.stdin)
instant = datetime.fromisoformat(payload["instant"].replace("Z", "+00:00"))
if instant.tzinfo is None:
    raise ValueError("instant must include timezone")
lookup = biblical_lookup_date(instant, payload["latitude"], payload["longitude"], payload["timezone"])
confirmations = tuple(MonthConfirmation.from_dict(item) for item in payload["confirmations"])
through = lookup + timedelta(days=payload["count"] - 1)
_, days, decision = CalendarBuilder().build(confirmations, through=through)
result = []
for offset in range(payload["count"]):
    civil = lookup + timedelta(days=offset)
    day = days.get(civil)
    hyear, hmonth, hday = gregorian_to_rabbinic(civil)
    result.append({
        "civil_date": civil.isoformat(),
        "biblical": day.biblical.display_parts() if day else {"day": None, "month_id": None, "month_ordinal": None},
        "rabbinic": {"day": hday, "month_id": hmonth, "year": hyear},
        "events": [event.event_id for event in day.events] if day else (["shabbat"] if civil.weekday() == 5 else []),
        "month_status": day.month_status.value if day else "pending",
        "year_start_status": decision.status.value,
        "confirmation_id": day.confirmation_id if day else None,
    })
json.dump({"schema_version": 1, "days": result, "year_start_status": decision.status.value,
           "next_sunset_at": next_sunset_after(instant, payload["latitude"], payload["longitude"], payload["timezone"]).isoformat(),
           "timezone": payload["timezone"]}, sys.stdout)
