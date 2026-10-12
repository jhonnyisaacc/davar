"""Apply explicit Davar month anchors without inferring an Aviv/year-start rule."""
from datetime import date

from calendar.models.enums import MonthStatus


def anchored_month_identities(confirmations, anchors):
    starts = sorted({item.starts_on_evening for item in confirmations
                     if item.status == MonthStatus.CONFIRMED})
    identities = {}
    for anchor in anchors:
        evening = date.fromisoformat(anchor["starts_on_evening"])
        ordinal = int(anchor["month_ordinal"])
        if not 1 <= ordinal <= 13:
            raise ValueError("Invalid biblical month ordinal")
        if evening not in starts:
            continue
        index = starts.index(evening)
        identities[evening] = {**anchor, "status": "manual", "month_ordinal": ordinal}
        for direction in (-1, 1):
            previous = index
            current = index + direction
            current_ordinal = ordinal + direction
            while 0 <= current < len(starts) and 1 <= current_ordinal <= 13:
                # Missing observations must not silently shift month numbers.
                if abs((starts[current] - starts[previous]).days) not in (29, 30):
                    break
                identities[starts[current]] = {
                    **anchor, "status": "manual", "month_ordinal": current_ordinal,
                }
                previous = current
                current += direction
                current_ordinal += direction
    return identities
