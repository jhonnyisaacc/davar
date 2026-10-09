"""Rails-owned boundary over the pinned Bore domain; stdin/stdout JSON only."""
import json
import sys
from datetime import date, datetime, timedelta
from calendar.models.month_confirmation import MonthConfirmation
from calendar.services.calendar_builder import CalendarBuilder
from calendar.services.biblical_clock import biblical_lookup_date
from calendar.services.rabbinic_calendar import gregorian_to_rabbinic
from calendar.services.sunset import next_sunset_after, sunset_on
from calendar.rules.biblical_months import month_id_for_ordinal
from calendar.services.moadim_calculator import MoadimCalculator
from month_identity import anchored_month_identities
from counted_moadim import counted_moadim_dates

payload = json.load(sys.stdin)
instant = datetime.fromisoformat(payload["instant"].replace("Z", "+00:00"))
if instant.tzinfo is None:
    raise ValueError("instant must include timezone")
lookup = biblical_lookup_date(instant, payload["latitude"], payload["longitude"], payload["timezone"])
confirmations = tuple(MonthConfirmation.from_dict(item) for item in payload["confirmations"])
through = lookup + timedelta(days=payload["count"] - 1)
_, days, decision = CalendarBuilder().build(confirmations, through=through)
identities = anchored_month_identities(confirmations, payload.get("month_anchors", []))
counted_dates = counted_moadim_dates(confirmations, identities, payload.get("counting_rule"))
confirmation_starts = {item.id: item.starts_on_evening for item in confirmations}
result = []
for offset in range(payload["count"]):
    civil = lookup + timedelta(days=offset)
    day = days.get(civil)
    hyear, hmonth, hday = gregorian_to_rabbinic(civil)
    biblical = day.biblical.display_parts() if day else {"day": None, "month_id": None, "month_ordinal": None}
    events = [event.event_id for event in day.events] if day else (["shabbat"] if civil.weekday() == 5 else [])
    identity = identities.get(confirmation_starts.get(day.confirmation_id)) if day else None
    if identity and biblical["month_id"] is None:
        biblical["month_ordinal"] = identity["month_ordinal"]
        biblical["month_id"] = month_id_for_ordinal(identity["month_ordinal"])
        events = [event.event_id for event in MoadimCalculator().events_for(biblical["month_id"], biblical["day"], civil)]
    counted_events = counted_dates.get(civil, [])
    events = list(dict.fromkeys(events + [event["event_id"] for event in counted_events]))
    result.append({
        "civil_date": civil.isoformat(),
        "biblical": biblical,
        "month_identity": identity,
        "rabbinic": {"day": hday, "month_id": hmonth, "year": hyear},
        "events": events,
        "counted_events": counted_events,
        "month_status": day.month_status.value if day else "pending",
        "year_start_status": decision.status.value,
        "confirmation_id": day.confirmation_id if day else None,
        "sunset_at": sunset_on(civil, payload["latitude"], payload["longitude"], payload["timezone"]).isoformat(),
    })
json.dump({"schema_version": 1, "days": result, "year_start_status": decision.status.value,
           "next_sunset_at": next_sunset_after(instant, payload["latitude"], payload["longitude"], payload["timezone"]).isoformat(),
           "timezone": payload["timezone"]}, sys.stdout)
