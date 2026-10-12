from __future__ import annotations

from datetime import date

from calendar.models.calendar_event import CalendarEvent
from calendar.rules.moadim import events_for_biblical_day


class MoadimCalculator:
    """Fixed-date Biblical appointments only.

    Bikurim, Omer, and Shavuot remain unresolved until an explicit
    project decision exists for the wave-sheaf day.
    """

    def events_for(self, month_id: str | None, day: int | None, civil_date: date) -> tuple[CalendarEvent, ...]:
        events = list(events_for_biblical_day(month_id, day))
        if day == 1 and month_id:
            events.insert(0, CalendarEvent(event_id="rosh_hodesh", data={}))
        elif day == 1:
            events.insert(0, CalendarEvent(event_id="rosh_hodesh", data={}))
        if civil_date.weekday() == 5:
            events.append(CalendarEvent(event_id="shabbat", data={}))
        return tuple(events)
