"""Aviv / year-start determination is intentionally unresolved in this PR.

New-moon observation answers whether a month started. It does not answer
whether that month is Aviv. See the dedicated Bore Aviv issue.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from calendar.models.enums import YearStartStatus
from calendar.models.month_confirmation import MonthConfirmation
from calendar.rules.biblical_months import month_id_for_ordinal


@dataclass(frozen=True)
class AvivDecision:
    status: YearStartStatus
    aviv_starts_on_evening: date | None
    note: str = ""


class AvivDeterminationPolicy(Protocol):
    def decide(self, confirmations: tuple[MonthConfirmation, ...]) -> AvivDecision:
        ...


class UnresolvedAvivDeterminationPolicy:
    def decide(self, confirmations: tuple[MonthConfirmation, ...]) -> AvivDecision:
        del confirmations
        return AvivDecision(
            status=YearStartStatus.UNRESOLVED,
            aviv_starts_on_evening=None,
            note="Aviv determination is a separate policy and is not inferred from new-moon reports.",
        )


@dataclass(frozen=True)
class ManualAvivAnchor:
    starts_on_evening: date
    note: str = "Manual year-start anchor. Not an automated agricultural finding."


class ManualAvivDeterminationPolicy:
    """Explicit maintainer override. Never treat this as an Aviv algorithm."""

    def __init__(self, anchors: tuple[ManualAvivAnchor, ...]):
        self.anchors = tuple(sorted(anchors, key=lambda item: item.starts_on_evening))

    def decide(self, confirmations: tuple[MonthConfirmation, ...]) -> AvivDecision:
        if not self.anchors:
            return UnresolvedAvivDeterminationPolicy().decide(confirmations)
        latest = self.anchors[-1]
        return AvivDecision(
            status=YearStartStatus.MANUAL,
            aviv_starts_on_evening=latest.starts_on_evening,
            note=latest.note,
        )

    def identity_for(self, starts_on_evening: date) -> tuple[str | None, int | None, YearStartStatus]:
        previous = [anchor for anchor in self.anchors if anchor.starts_on_evening <= starts_on_evening]
        if not previous:
            return None, None, YearStartStatus.UNRESOLVED
        year_start = previous[-1].starts_on_evening
        # Ordinal assignment is the caller's job using the confirmed sequence.
        del year_start
        return None, None, YearStartStatus.MANUAL


def assign_month_identity(
    confirmations: tuple[MonthConfirmation, ...],
    decision: AvivDecision,
) -> dict[date, tuple[str | None, int | None]]:
    """Map confirmed month-start evenings to (month_id, ordinal)."""
    if decision.status == YearStartStatus.UNRESOLVED or decision.aviv_starts_on_evening is None:
        return {item.starts_on_evening: (None, None) for item in confirmations}

    year_start = decision.aviv_starts_on_evening
    in_year = [item for item in confirmations if item.starts_on_evening >= year_start]
    in_year.sort(key=lambda item: item.starts_on_evening)
    assigned: dict[date, tuple[str | None, int | None]] = {}
    for index, item in enumerate(in_year, start=1):
        assigned[item.starts_on_evening] = (month_id_for_ordinal(index), index)
    for item in confirmations:
        assigned.setdefault(item.starts_on_evening, (None, None))
    return assigned
