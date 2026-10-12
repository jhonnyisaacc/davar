"""Adapt INMS reports to Rails persistence without changing pinned Bore rules."""
import json
import sys
from datetime import date, datetime

from calendar.models.enums import SourceStatus
from calendar.sources.html_tables import extract_tables
from calendar.sources.israeli_new_moon_society import (
    IsraeliNewMoonSocietySource,
    _looks_like_observation_table,
    _parse_observation_table,
)


def parse_feed(payload):
    source = IsraeliNewMoonSocietySource()
    fetched_at = datetime.fromisoformat(payload["fetched_at"].replace("Z", "+00:00"))
    known = payload.get("known_hashes", {})
    entries = source.normalize_rss(payload["rss_xml"])
    if not entries:
        raise ValueError("Empty feed; retain previously imported evidence")
    reports = []
    for entry in entries:
        report = {"source_entry_id": entry.source_entry_id,
                  "source_url": entry.source_url, "title": entry.title,
                  "content_hash": entry.content_hash}
        if known.get(entry.source_entry_id) == entry.content_hash:
            report["unchanged"] = True
        else:
            # The pinned parser can return partial rows alongside uncertainty.
            # A partial report must never silently replace previously valid evidence.
            tables = [table for table in extract_tables(entry.html)
                      if _looks_like_observation_table(table)]
            review = next((item for item in payload.get("report_reviews", [])
                           if item["source_url"] == entry.source_url
                           and item["content_hash"] == entry.content_hash), None)
            if review and len(tables) == 1:
                reviewed_date = date.fromisoformat(review["observed_on"])
                tables = [[[reviewed_date.strftime("%d/%m/%Y")]] + tables[0]]
            observations = []
            uncertain = False
            for table in tables:
                parsed, table_uncertain = _parse_observation_table(
                    table, source_entry_id=entry.source_entry_id,
                    source_url=entry.source_url, fetched_at=fetched_at,
                    raw_source_hash=entry.content_hash,
                )
                observations.extend(parsed)
                uncertain = uncertain or table_uncertain
            status = SourceStatus.REQUIRES_REVIEW if uncertain else SourceStatus.OK
            rows = [item.to_dict() for item in observations] if status == SourceStatus.OK else []
            if review:
                for row in rows:
                    row["date_review"] = review
            report.update(raw_content=entry.html, parse_status=status.value,
                          reason="parser_uncertain" if uncertain else
                          "reviewed_report_date" if review and rows else
                          "no_observation_table" if not tables else "",
                          observations=rows)
        reports.append(report)
    return {"schema_version": 1, "entries": reports}


if __name__ == "__main__":
    json.dump(parse_feed(json.load(sys.stdin)), sys.stdout)
