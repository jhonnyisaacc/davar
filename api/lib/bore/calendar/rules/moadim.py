"""Fixed-date moadim that Scripture states without an extra counting policy.

Omer, Bikurim, and Shavuot depend on the wave-sheaf day and are NOT assigned
here. See docs/moadim-audit.md.
"""

from calendar.models.calendar_event import CalendarEvent

FIXED_MOADIM: dict[tuple[str, int], tuple[str, ...]] = {
    ("aviv", 14): ("pesach",),
    ("aviv", 15): ("hag_hamatzot",),
    ("aviv", 16): ("hag_hamatzot",),
    ("aviv", 17): ("hag_hamatzot",),
    ("aviv", 18): ("hag_hamatzot",),
    ("aviv", 19): ("hag_hamatzot",),
    ("aviv", 20): ("hag_hamatzot",),
    ("aviv", 21): ("hag_hamatzot_last",),
    ("etanim", 1): ("yom_teruah",),
    ("etanim", 10): ("yom_hakipurim",),
    ("etanim", 15): ("sukkot",),
    ("etanim", 16): ("sukkot",),
    ("etanim", 17): ("sukkot",),
    ("etanim", 18): ("sukkot",),
    ("etanim", 19): ("sukkot",),
    ("etanim", 20): ("sukkot",),
    ("etanim", 21): ("sukkot_last",),
    ("etanim", 22): ("shemini_atzeret",),
}

UNRESOLVED_COUNTING_EVENTS = frozenset({"bikurim", "omer", "shavuot"})


def events_for_biblical_day(month_id: str | None, day: int | None) -> tuple[CalendarEvent, ...]:
    if not month_id or not day:
        return ()
    event_ids = FIXED_MOADIM.get((month_id, day), ())
    return tuple(CalendarEvent(event_id=event_id, data={}) for event_id in event_ids)
