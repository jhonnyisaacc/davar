from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from calendar.models.enums import MonthStatus, SourceStatus
from calendar.models.month_confirmation import MonthConfirmation
from calendar.models.source_entry import SourceEntry
from calendar.rules.confirmation import qualifies_for_automatic_confirmation
from calendar.sources.israeli_new_moon_society import (
    ISRAELI_NEW_MOON_SOCIETY_RSS,
    IsraeliNewMoonSocietySource,
)
from calendar.sources.store import CalendarStore


@dataclass(frozen=True)
class SyncResult:
    status: SourceStatus
    fetched: int
    parsed: int
    unchanged: int
    observations_upserted: int
    confirmations_upserted: int
    reason: str = ""


class ObservationSyncService:
    def __init__(
        self,
        store: CalendarStore | None = None,
        source: IsraeliNewMoonSocietySource | None = None,
    ):
        self.store = store or CalendarStore()
        self.source = source or IsraeliNewMoonSocietySource()

    def sync(
        self,
        *,
        rss_xml: str | None = None,
        rss_url: str = ISRAELI_NEW_MOON_SOCIETY_RSS,
        fetched_at: datetime | None = None,
    ) -> SyncResult:
        now = fetched_at or datetime.now(timezone.utc)
        if rss_xml is None:
            try:
                rss_xml = _fetch(rss_url)
            except URLError as exc:
                return SyncResult(
                    status=SourceStatus.SOURCE_UNAVAILABLE,
                    fetched=0,
                    parsed=0,
                    unchanged=0,
                    observations_upserted=0,
                    confirmations_upserted=0,
                    reason=f"rss_unavailable: {exc}",
                )
        try:
            entries = self.source.normalize_rss(rss_xml)
        except ValueError as exc:
            return SyncResult(
                status=SourceStatus.MALFORMED,
                fetched=0,
                parsed=0,
                unchanged=0,
                observations_upserted=0,
                confirmations_upserted=0,
                reason=str(exc),
            )

        stored_entries = self.store.load_entries()
        observations = self.store.load_observations()
        parsed = 0
        unchanged = 0
        upserted_obs = 0

        for entry in entries:
            previous = stored_entries.get(entry.source_entry_id)
            if previous and previous.content_hash == entry.content_hash:
                stored_entries[entry.source_entry_id] = SourceEntry(
                    source=entry_source(entry),
                    source_entry_id=entry.source_entry_id,
                    source_url=entry.source_url,
                    title=entry.title,
                    content_hash=entry.content_hash,
                    last_seen_at=now,
                    last_parsed_at=previous.last_parsed_at,
                    parse_status=previous.parse_status,
                    raw_content=previous.raw_content,
                )
                unchanged += 1
                continue

            result = self.source.parse_report(
                entry.html,
                source_entry_id=entry.source_entry_id,
                source_url=entry.source_url,
                fetched_at=now,
                content_hash=entry.content_hash,
            )
            parsed += 1
            stored_entries[entry.source_entry_id] = SourceEntry(
                source=entry_source(entry),
                source_entry_id=entry.source_entry_id,
                source_url=entry.source_url,
                title=entry.title,
                content_hash=entry.content_hash,
                last_seen_at=now,
                last_parsed_at=now,
                parse_status=result.status,
                raw_content=entry.html,
            )
            # Replacing observations for this entry keeps ingestion idempotent
            # when a post is updated.
            stale_ids = [obs_id for obs_id, obs in observations.items() if obs.source_entry_id == entry.source_entry_id]
            for stale_id in stale_ids:
                del observations[stale_id]
            for observation in result.observations:
                observations[observation.id] = observation
                upserted_obs += 1

        confirmations = apply_confirmations(tuple(observations.values()), now)
        previous_confirmations = self.store.load_confirmations()
        confirmation_map = {item.id: item for item in confirmations}
        # Preserve ingested_at for unchanged confirmations.
        for key, item in confirmation_map.items():
            prior = previous_confirmations.get(key)
            if prior and prior.observation_ids == item.observation_ids:
                confirmation_map[key] = prior

        self.store.save_entries(stored_entries)
        self.store.save_observations(observations)
        self.store.save_confirmations(confirmation_map)
        return SyncResult(
            status=SourceStatus.OK,
            fetched=len(entries),
            parsed=parsed,
            unchanged=unchanged,
            observations_upserted=upserted_obs,
            confirmations_upserted=len(confirmation_map),
        )


def entry_source(entry) -> NewMoonSource:
    from calendar.models.enums import NewMoonSource

    return NewMoonSource.ISRAELI_NEW_MOON_SOCIETY


def apply_confirmations(observations, ingested_at: datetime) -> tuple[MonthConfirmation, ...]:
    from collections import defaultdict

    grouped: dict[tuple[str, str], list] = defaultdict(list)
    for observation in observations:
        grouped[(observation.source_entry_id, observation.observed_on.isoformat())].append(observation)

    confirmations: list[MonthConfirmation] = []
    for (entry_id, observed_on), group in grouped.items():
        qualifiers = [item for item in group if qualifies_for_automatic_confirmation(item)]
        sample = qualifiers[0] if qualifiers else group[0]
        status = MonthStatus.CONFIRMED if qualifiers else MonthStatus.PENDING
        reason = "unaided_israel_observation" if qualifiers else _pending_reason(group)
        used = qualifiers or group
        confirmations.append(
            MonthConfirmation(
                id=f"{sample.source.value}:{entry_id}:{observed_on}",
                status=status,
                observed_on=sample.observed_on,
                starts_on_evening=sample.observed_on,
                source=sample.source,
                source_entry_id=entry_id,
                source_url=sample.source_url,
                observation_ids=tuple(sorted(item.id for item in used)),
                observers=tuple(sorted({item.observer for item in used})),
                locations=tuple(sorted({item.location for item in used})),
                unaided=bool(qualifiers),
                ingested_at=ingested_at,
                reason=reason,
            )
        )
    return tuple(sorted(confirmations, key=lambda item: item.observed_on))


def _pending_reason(group) -> str:
    if all(item.country != "IL" for item in group):
        return "observation_outside_israel"
    if all(item.visibility_method.value != "unaided" for item in group):
        return "no_unaided_observation"
    return "insufficient_evidence"


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": "BoreCalendar/1.0 (+https://github.com/jhonnyisaacc/bore)"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")
