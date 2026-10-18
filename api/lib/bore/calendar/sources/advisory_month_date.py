from __future__ import annotations

import re
from datetime import date
from typing import Callable, Mapping
from urllib.request import Request, urlopen

RENEWED_MOON_URL = "https://renewedmoon.com/"
WHEN_IS_THE_NEW_MOON_URL = "https://whenisthenewmoon.com/"

_FETCH_TIMEOUT_SECONDS = 3
_MAX_BYTES = 250_000
_MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
_MONTH_DATE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)"
    r"\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})\b",
    re.I,
)
_ISRAEL_BLOCK = re.compile(r"method-summary--israel\b(.*?)(?:</section>|$)", re.I | re.S)
_SIGHTED_LABEL = re.compile(r"Date\s+Sighted\s*:\s*([^<\n]+)", re.I)


def advisory_observed_on(
    pages: Mapping[str, str] | None = None,
    *,
    fetch: Callable[[str], str] | None = None,
) -> date | None:
    """Published report date for naming only. None when no source has one."""
    try:
        renewed = _page(RENEWED_MOON_URL, pages, fetch)
        found = _israel_report_date(renewed) if renewed else None
        if found is not None:
            return found
        other = _page(WHEN_IS_THE_NEW_MOON_URL, pages, fetch)
        return _sighted_report_date(other) if other else None
    except Exception:
        return None


def _israel_report_date(html: str) -> date | None:
    match = _ISRAEL_BLOCK.search(html)
    if match is None:
        return None
    block = match.group(1)
    if re.search(r"status-confirmed\b", block, re.I) is None:
        return None
    dated = re.search(r"method-summary__date\">\s*([^<]+)", block, re.I)
    if dated is None:
        return None
    return _parse_month_day_year(dated.group(1))


def _sighted_report_date(html: str) -> date | None:
    match = _SIGHTED_LABEL.search(html)
    if match is None:
        return None
    return _parse_month_day_year(match.group(1))


def _page(
    url: str,
    pages: Mapping[str, str] | None,
    fetch: Callable[[str], str] | None,
) -> str | None:
    if pages is not None:
        text = pages.get(url)
        return text if text else None
    getter = fetch or _fetch
    return getter(url)


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": "DavarCalendar/1.0"})
    with urlopen(request, timeout=_FETCH_TIMEOUT_SECONDS) as response:
        return response.read(_MAX_BYTES).decode("utf-8", "replace")


def _parse_month_day_year(text: str) -> date | None:
    match = _MONTH_DATE.search(text)
    if match is None:
        return None
    month = _MONTHS[match.group(1).lower()]
    day = int(match.group(2))
    year = int(match.group(3))
    try:
        return date(year, month, day)
    except ValueError:
        return None
