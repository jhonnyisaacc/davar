from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from typing import Iterable
from xml.etree import ElementTree

from calendar.models.enums import NewMoonSource, SourceStatus, VisibilityMethod
from calendar.models.new_moon_observation import NewMoonObservation
from calendar.sources.geography import infer_country
from calendar.sources.html_tables import extract_tables

ISRAELI_NEW_MOON_SOCIETY_RSS = "https://moonsocil.blogspot.com/feeds/posts/default?alt=rss"
ISRAELI_NEW_MOON_SOCIETY_SITE = "https://moonsocil.blogspot.com/"

_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})")
_NUMERIC_DATE_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b")
_NAMED_DATE_RE = re.compile(
    r"\b(\d{1,2})[- ](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[- ](\d{4})\b",
    re.I,
)
_MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

_HEADER_ALIASES = {
    "observer": ("observer", "observers", "צופה"),
    "location": ("location", "מיקום"),
    "unaided": ("unaided", "naked", "ראייה בעין", "בעין"),
    "aided": ("aided", "binocular", "אמצעי עזר", "משקפת"),
}


@dataclass(frozen=True)
class NormalizedRssEntry:
    source_entry_id: str
    source_url: str
    title: str
    published_at: datetime | None
    html: str
    content_hash: str


@dataclass(frozen=True)
class ReportParseResult:
    status: SourceStatus
    observations: tuple[NewMoonObservation, ...]
    reason: str = ""


class IsraeliNewMoonSocietySource:
    source = NewMoonSource.ISRAELI_NEW_MOON_SOCIETY

    def normalize_rss(self, rss_xml: str) -> tuple[NormalizedRssEntry, ...]:
        try:
            root = ElementTree.fromstring(rss_xml)
        except ElementTree.ParseError as exc:
            raise ValueError(f"RSS malformed: {exc}") from exc
        channel = root.find("channel")
        if channel is None:
            raise ValueError("RSS malformed: missing channel")
        entries: list[NormalizedRssEntry] = []
        for item in channel.findall("item"):
            html = unescape((item.findtext("description") or "").strip())
            source_entry_id = (item.findtext("guid") or item.findtext("link") or "").strip()
            source_url = (item.findtext("link") or "").strip()
            title = (item.findtext("title") or "").strip()
            published = item.findtext("pubDate")
            published_at = None
            if published:
                try:
                    published_at = parsedate_to_datetime(published)
                except (TypeError, ValueError):
                    published_at = None
            if not source_entry_id:
                continue
            entries.append(
                NormalizedRssEntry(
                    source_entry_id=source_entry_id,
                    source_url=source_url,
                    title=title,
                    published_at=published_at,
                    html=html,
                    content_hash=hash_content(html),
                )
            )
        return tuple(entries)

    def parse_report(
        self,
        html: str,
        *,
        source_entry_id: str,
        source_url: str,
        fetched_at: datetime,
        content_hash: str | None = None,
    ) -> ReportParseResult:
        raw_hash = content_hash or hash_content(html)
        tables = extract_tables(html)
        observation_tables = [table for table in tables if _looks_like_observation_table(table)]
        if not observation_tables:
            return ReportParseResult(
                status=SourceStatus.OK,
                observations=(),
                reason="no_observation_table",
            )

        observations: list[NewMoonObservation] = []
        uncertain = False
        for table in observation_tables:
            parsed, table_uncertain = _parse_observation_table(
                table,
                source_entry_id=source_entry_id,
                source_url=source_url,
                fetched_at=fetched_at,
                raw_source_hash=raw_hash,
            )
            observations.extend(parsed)
            uncertain = uncertain or table_uncertain

        if uncertain and not observations:
            return ReportParseResult(
                status=SourceStatus.REQUIRES_REVIEW,
                observations=(),
                reason="parser_uncertain",
            )
        return ReportParseResult(status=SourceStatus.OK, observations=tuple(observations))


def hash_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def observation_id(
    source_entry_id: str,
    observer: str,
    observed_on: date,
    location: str,
    visibility_method: VisibilityMethod,
) -> str:
    material = "|".join(
        [
            NewMoonSource.ISRAELI_NEW_MOON_SOCIETY.value,
            source_entry_id,
            observer.strip().lower(),
            observed_on.isoformat(),
            location.strip().lower(),
            visibility_method.value,
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


def _normalize_header(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _header_role(cell: str) -> str | None:
    text = _normalize_header(cell)
    for role, aliases in _HEADER_ALIASES.items():
        if any(alias in text for alias in aliases):
            return role
    return None


def _looks_like_observation_table(table: list[list[str]]) -> bool:
    for row in table[:4]:
        roles = {_header_role(cell) for cell in row}
        if "unaided" in roles or "aided" in roles:
            return True
    return False


def _parse_observation_table(
    table: list[list[str]],
    *,
    source_entry_id: str,
    source_url: str,
    fetched_at: datetime,
    raw_source_hash: str,
) -> tuple[list[NewMoonObservation], bool]:
    header_index = None
    columns: dict[str, list[int]] = {}
    for index, row in enumerate(table):
        roles = [_header_role(cell) for cell in row]
        if roles.count("unaided") or roles.count("aided"):
            header_index = index
            for col, role in enumerate(roles):
                if role:
                    columns.setdefault(role, []).append(col)
            break
    if header_index is None or "observer" not in columns:
        return [], True

    columns = _prefer_english_columns(table[header_index], columns)
    observed_on = _date_from_rows(table[: header_index + 1])
    observations: list[NewMoonObservation] = []
    section_date = observed_on
    section_country_hint = None

    for row in table[header_index + 1 :]:
        banner_date = _date_from_text(" ".join(row))
        observer = _first_cell(row, columns.get("observer", []))
        location = _first_cell(row, columns.get("location", []))
        unaided_text = _first_cell(row, columns.get("unaided", []))
        aided_text = _first_cell(row, columns.get("aided", []))
        if banner_date and not _parse_time(unaided_text) and not _parse_time(aided_text):
            section_date = banner_date
            if infer_country(observer, location, *row) != "unknown":
                section_country_hint = infer_country(observer, location, *row)
            continue
        if not observer:
            continue
        row_date = _date_from_text(" ".join(row)) or section_date
        if row_date is None:
            return observations, True
        country = infer_country(location, observer, *row)
        if country == "unknown" and section_country_hint:
            country = section_country_hint

        for method, raw in (
            (VisibilityMethod.UNAIDED, unaided_text),
            (VisibilityMethod.AIDED, aided_text),
        ):
            seen_at = _parse_time(raw)
            if seen_at is None and not _explicit_seeing(raw):
                continue
            observations.append(
                NewMoonObservation(
                    id=observation_id(source_entry_id, observer, row_date, location, method),
                    source=NewMoonSource.ISRAELI_NEW_MOON_SOCIETY,
                    source_entry_id=source_entry_id,
                    source_url=source_url,
                    observed_on=row_date,
                    observed_at=seen_at,
                    observer=observer,
                    location=location,
                    country=country,
                    visibility_method=method,
                    verified=True,
                    raw_source_hash=raw_source_hash,
                    fetched_at=fetched_at,
                )
            )
    return observations, False


def _prefer_english_columns(header_row: list[str], columns: dict[str, list[int]]) -> dict[str, list[int]]:
    preferred = dict(columns)
    for role, indexes in columns.items():
        if len(indexes) < 2:
            continue
        latin = [
            index
            for index in indexes
            if index < len(header_row) and re.search(r"[A-Za-z]", header_row[index] or "")
        ]
        if latin:
            preferred[role] = latin
    return preferred


def _row_has_observer(row: list[str], columns: dict[str, list[int]]) -> bool:
    return bool(_first_cell(row, columns.get("observer", [])))


def _first_cell(row: list[str], indexes: Iterable[int]) -> str:
    for index in indexes:
        if 0 <= index < len(row) and row[index].strip():
            return row[index].strip()
    return ""


def _explicit_seeing(value: str) -> bool:
    text = value.strip().lower()
    if not text:
        return False
    if text in {"-", "—", "n/a", "no", "לא"}:
        return False
    return _parse_time(text) is not None or text in {"yes", "seen", "naked eye"}


def _parse_time(value: str) -> time | None:
    match = _TIME_RE.search(value or "")
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    if hours > 23 or minutes > 59:
        return None
    return time(hours, minutes)


def _date_from_rows(rows: list[list[str]]) -> date | None:
    for row in rows:
        parsed = _date_from_text(" ".join(row))
        if parsed:
            return parsed
    return None


def _date_from_text(text: str) -> date | None:
    numeric = _NUMERIC_DATE_RE.search(text)
    if numeric:
        first, second, year = (int(numeric.group(1)), int(numeric.group(2)), int(numeric.group(3)))
        # Israeli reports use day/month/year.
        day, month = (first, second) if first > 12 or second <= 12 else (second, first)
        if month > 12 and first <= 12:
            month, day = first, second
        try:
            return date(year, month, day)
        except ValueError:
            return None
    named = _NAMED_DATE_RE.search(text)
    if named:
        day = int(named.group(1))
        month = _MONTHS[named.group(2)[:3].lower()]
        year = int(named.group(3))
        try:
            return date(year, month, day)
        except ValueError:
            return None
    return None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
