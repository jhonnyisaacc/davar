from __future__ import annotations

from datetime import date, timedelta

from calendar.models.biblical_date import BiblicalDate
from calendar.models.biblical_month import BiblicalMonth
from calendar.models.calendar_day import CalendarDay, RabbinicDate
from calendar.models.enums import MonthStatus, YearStartStatus
from calendar.models.month_confirmation import MonthConfirmation
from calendar.services.aviv_policy import (
    AvivDecision,
    AvivDeterminationPolicy,
    UnresolvedAvivDeterminationPolicy,
    assign_month_identity,
)
from calendar.services.moadim_calculator import MoadimCalculator
from calendar.services.rabbinic_calendar import gregorian_to_rabbinic

MAX_MONTH_LENGTH = 30


class CalendarBuilder:
    def __init__(
        self,
        aviv_policy: AvivDeterminationPolicy | None = None,
        moadim: MoadimCalculator | None = None,
    ):
        self.aviv_policy = aviv_policy or UnresolvedAvivDeterminationPolicy()
        self.moadim = moadim or MoadimCalculator()

    def build(
        self,
        confirmations: tuple[MonthConfirmation, ...],
        *,
        through: date | None = None,
    ) -> tuple[tuple[BiblicalMonth, ...], dict[date, CalendarDay], AvivDecision]:
        confirmed = tuple(
            item
            for item in sorted(confirmations, key=lambda item: item.starts_on_evening)
            if item.status == MonthStatus.CONFIRMED
        )
        decision = self.aviv_policy.decide(confirmed)
        identities = assign_month_identity(confirmed, decision)
        months = self._months(confirmed, identities, through, decision.status)
        days: dict[date, CalendarDay] = {}
        for month in months:
            last = month.last_daytime
            if last is None:
                continue
            day_number = 1
            current = month.first_daytime
            while current <= last:
                month_id, ordinal = identities.get(month.starts_on_evening, (None, None))
                biblical = BiblicalDate(
                    day=day_number,
                    month_id=month_id,
                    month_ordinal=ordinal,
                    year_start_status=decision.status,
                )
                hyear, hmonth, hday = gregorian_to_rabbinic(current)
                events = self.moadim.events_for(month_id, day_number, current)
                days[current] = CalendarDay(
                    civil_date=current,
                    biblical=biblical,
                    rabbinic=RabbinicDate(day=hday, month_id=hmonth, year=hyear),
                    events=events,
                    month_status=month.status,
                    year_start_status=decision.status,
                    confirmation_id=month.confirmation_id,
                )
                day_number += 1
                current += timedelta(days=1)
        self._fill_unresolved_gaps(days, months, through, decision)
        return months, days, decision

    def _months(
        self,
        confirmed: tuple[MonthConfirmation, ...],
        identities: dict[date, tuple[str | None, int | None]],
        through: date | None,
        year_start_status: YearStartStatus,
    ) -> tuple[BiblicalMonth, ...]:
        months: list[BiblicalMonth] = []
        for index, item in enumerate(confirmed):
            next_item = confirmed[index + 1] if index + 1 < len(confirmed) else None
            first_daytime = item.starts_on_evening + timedelta(days=1)
            natural_end = first_daytime + timedelta(days=MAX_MONTH_LENGTH - 1)
            if next_item:
                next_last_daytime = next_item.starts_on_evening
                last_daytime = min(natural_end, next_last_daytime)
            else:
                last_daytime = natural_end
                if through and last_daytime > through:
                    last_daytime = max(first_daytime, through)
            month_id, ordinal = identities.get(item.starts_on_evening, (None, None))
            months.append(
                BiblicalMonth(
                    confirmation_id=item.id,
                    status=MonthStatus.CONFIRMED,
                    starts_on_evening=item.starts_on_evening,
                    first_daytime=first_daytime,
                    last_daytime=last_daytime,
                    month_id=month_id,
                    month_ordinal=ordinal,
                    year_start_status=year_start_status,
                    day_count=(last_daytime - first_daytime).days + 1,
                )
            )
        return tuple(months)

    def _fill_unresolved_gaps(
        self,
        days: dict[date, CalendarDay],
        months: tuple[BiblicalMonth, ...],
        through: date | None,
        decision: AvivDecision,
    ) -> None:
        if not through or not months:
            return
        current = months[0].first_daytime
        while current <= through:
            if current not in days:
                hyear, hmonth, hday = gregorian_to_rabbinic(current)
                days[current] = CalendarDay(
                    civil_date=current,
                    biblical=BiblicalDate(
                        day=None,
                        month_id=None,
                        month_ordinal=None,
                        year_start_status=decision.status,
                    ),
                    rabbinic=RabbinicDate(day=hday, month_id=hmonth, year=hyear),
                    events=self.moadim.events_for(None, None, current),
                    month_status=MonthStatus.PENDING,
                    year_start_status=decision.status,
                    confirmation_id=None,
                )
            current += timedelta(days=1)
