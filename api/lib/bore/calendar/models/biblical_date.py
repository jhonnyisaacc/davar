from __future__ import annotations

from dataclasses import dataclass

from calendar.models.enums import YearStartStatus


@dataclass(frozen=True)
class BiblicalDate:
    day: int | None
    month_id: str | None
    month_ordinal: int | None
    year_start_status: YearStartStatus

    def display_parts(self) -> dict[str, int | str | None]:
        return {
            "day": self.day,
            "month_id": self.month_id,
            "month_ordinal": self.month_ordinal,
            "year_start_status": self.year_start_status.value,
        }
