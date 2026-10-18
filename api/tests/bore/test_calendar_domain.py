import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from calendar.models.enums import MonthStatus, NewMoonSource, YearStartStatus
from calendar.models.month_confirmation import MonthConfirmation
from calendar.rules.biblical_months import month_id_for_ordinal
from calendar.rules.forbidden_names import contains_babylonian_month_name
from calendar.rules.moadim import UNRESOLVED_COUNTING_EVENTS
from calendar.services.aviv_policy import ManualAvivAnchor, ManualAvivDeterminationPolicy, assign_month_identity
from calendar.services.calendar_builder import CalendarBuilder
from calendar.services.moadim_calculator import MoadimCalculator


def _confirmation(day: date, suffix: str) -> MonthConfirmation:
    return MonthConfirmation(
        id=f"inms:{suffix}",
        status=MonthStatus.CONFIRMED,
        observed_on=day,
        starts_on_evening=day,
        source=NewMoonSource.ISRAELI_NEW_MOON_SOCIETY,
        source_entry_id=suffix,
        source_url=f"https://example.test/{suffix}",
        observation_ids=(suffix,),
        observers=("Observer",),
        locations=("Jerusalem",),
        unaided=True,
        ingested_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        reason="unaided_israel_observation",
    )


def test_pending_observation_does_not_start_a_month():
    pending = MonthConfirmation(
        id="pending",
        status=MonthStatus.PENDING,
        observed_on=date(2026, 9, 12),
        starts_on_evening=date(2026, 9, 12),
        source=NewMoonSource.ISRAELI_NEW_MOON_SOCIETY,
        source_entry_id="x",
        source_url="https://example.test",
        observation_ids=("x",),
        observers=("Simcha",),
        locations=("Modiin Ilit",),
        unaided=False,
        ingested_at=datetime(2026, 9, 13, tzinfo=timezone.utc),
        reason="no_unaided_observation",
    )
    months, days, decision = CalendarBuilder().build((pending,), through=date(2026, 9, 20))
    assert months == ()
    assert decision.status == YearStartStatus.UNRESOLVED
    assert all(day.month_status == MonthStatus.PENDING or day.biblical.day is None for day in days.values()) or days == {}


def test_confirmed_month_starts_the_evening_after_sighting_daytime_key():
    confirmation = _confirmation(date(2026, 8, 14), "elul")
    months, days, _ = CalendarBuilder().build((confirmation,), through=date(2026, 8, 16))
    assert months[0].first_daytime == date(2026, 8, 15)
    assert days[date(2026, 8, 15)].biblical.day == 1
    assert days[date(2026, 8, 15)].events[0].event_id == "rosh_hodesh"


def test_biblical_month_names_are_scripture_only():
    assert month_id_for_ordinal(1) == "aviv"
    assert month_id_for_ordinal(2) == "ziv"
    assert month_id_for_ordinal(3) == "third_month"
    assert month_id_for_ordinal(7) == "etanim"
    assert month_id_for_ordinal(8) == "bul"
    assert month_id_for_ordinal(13) == "thirteenth_month"
    for ordinal in range(1, 14):
        assert not contains_babylonian_month_name(month_id_for_ordinal(ordinal))


def test_full_month_opens_one_pending_month():
    confirmation = _confirmation(date(2026, 9, 12), "etanim")
    _, days, _ = CalendarBuilder().build((confirmation,), through=date(2026, 11, 12))
    assert days[date(2026, 10, 12)].biblical.day == 30
    assert days[date(2026, 10, 12)].month_status == MonthStatus.CONFIRMED
    opened = days[date(2026, 10, 13)]
    assert opened.biblical.day == 1
    assert opened.biblical.month_id is None
    assert opened.month_status == MonthStatus.PENDING
    assert opened.confirmation_id is None
    assert days[date(2026, 10, 18)].biblical.day == 6
    assert days[date(2026, 10, 18)].month_status == MonthStatus.PENDING
    assert days[date(2026, 11, 11)].biblical.day == 30
    assert days[date(2026, 11, 12)].biblical.day is None


def test_month_does_not_span_a_missing_report():
    confirmations = (
        _confirmation(date(2026, 1, 20), "winter"),
        _confirmation(date(2026, 4, 18), "spring"),
    )
    months, days, _ = CalendarBuilder().build(confirmations, through=date(2026, 4, 20))
    assert months[0].day_count == 30
    assert days[date(2026, 2, 20)].month_status == MonthStatus.PENDING
    assert days[date(2026, 2, 20)].biblical.day is None
    assert days[date(2026, 4, 19)].biblical.day == 1


def test_unresolved_aviv_does_not_name_months():
    confirmations = (
        _confirmation(date(2026, 3, 20), "a"),
        _confirmation(date(2026, 4, 18), "b"),
    )
    months, days, decision = CalendarBuilder().build(confirmations, through=date(2026, 4, 20))
    assert decision.status == YearStartStatus.UNRESOLVED
    assert all(month.month_id is None for month in months)
    assert all(day.biblical.month_id is None for day in days.values())
    assert "6025" not in str(days)


def test_manual_aviv_assigns_ordinals_without_becoming_an_algorithm():
    confirmations = (
        _confirmation(date(2026, 3, 20), "aviv"),
        _confirmation(date(2026, 4, 18), "ziv"),
    )
    policy = ManualAvivDeterminationPolicy(
        (ManualAvivAnchor(starts_on_evening=date(2026, 3, 20), note="test fixture only"),)
    )
    decision = policy.decide(confirmations)
    assigned = assign_month_identity(confirmations, decision)
    assert assigned[date(2026, 3, 20)] == ("aviv", 1)
    assert assigned[date(2026, 4, 18)] == ("ziv", 2)
    months, days, built = CalendarBuilder(aviv_policy=policy).build(confirmations, through=date(2026, 4, 20))
    assert built.status == YearStartStatus.MANUAL
    assert days[date(2026, 4, 1)].biblical.month_id == "aviv"
    assert days[date(2026, 4, 1)].biblical.day == 12
    assert "pesach" in {event.event_id for event in days[date(2026, 4, 3)].events}


def test_rabbinic_calendar_keeps_traditional_names():
    confirmation = _confirmation(date(2026, 8, 14), "elul")
    _, days, _ = CalendarBuilder().build((confirmation,), through=date(2026, 8, 15))
    rabbinic = days[date(2026, 8, 15)].rabbinic
    assert rabbinic.month_id in {"av", "elul", "tishrei", "cheshvan", "nisan", "iyar", "sivan", "tammuz", "kislev", "tevet", "shevat", "adar", "adar_ii"}
    assert days[date(2026, 8, 15)].biblical.month_id is None


def test_event_ids_are_locale_independent():
    events = MoadimCalculator().events_for("aviv", 14, date(2026, 4, 3))
    assert [event.event_id for event in events] == ["pesach"]
    assert "Pesaj" not in str(events)
    assert UNRESOLVED_COUNTING_EVENTS == frozenset({"bikurim", "omer", "shavuot"})


def _bridge_days(payload):
    bore = Path(__file__).resolve().parents[2] / "lib" / "bore"
    env = os.environ.copy()
    env["PYTHONPATH"] = str(bore)
    proc = subprocess.run(
        [sys.executable, str(bore / "bridge.py")],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=bore,
        env=env,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    return {day["civil_date"]: day for day in json.loads(proc.stdout)["days"]}


def _etanim_tail_payload(**extra):
    confirmation = _confirmation(date(2026, 9, 12), "etanim")
    payload = {
        "instant": "2026-10-12T06:00:00+00:00",
        "latitude": 31.7683,
        "longitude": 35.2137,
        "timezone": "Asia/Jerusalem",
        "count": 10,
        "month_anchors": [
            {
                "starts_on_evening": "2026-09-12",
                "month_ordinal": 7,
                "source_url": "https://example.test/etanim",
                "note": "seventh month",
            }
        ],
        "confirmations": [confirmation.to_dict()],
        "advisory_observed_on": None,
    }
    payload.update(extra)
    return payload


def test_bridge_names_the_open_tail_from_the_previous_anchor():
    by_date = _bridge_days(_etanim_tail_payload())
    etanim = by_date["2026-10-12"]
    assert etanim["biblical"]["day"] == 30
    assert etanim["biblical"]["month_id"] == "etanim"
    assert etanim["biblical"]["month_ordinal"] == 7
    assert etanim["month_status"] == "confirmed"
    bul = by_date["2026-10-18"]
    assert bul["biblical"]["day"] == 6
    assert bul["biblical"]["month_id"] == "bul"
    assert bul["biblical"]["month_ordinal"] == 8
    assert bul["month_status"] == "pending"
    assert bul["confirmation_id"] is None
    assert bul["month_identity"] is None
    assert bul["rabbinic"]["month_id"] == "cheshvan"
    assert bul["events"] == []
    assert by_date["2026-10-13"]["events"] == ["rosh_hodesh"]


def test_secondary_report_date_names_pending_days_without_a_confirmation():
    for observed_on in ("2026-10-12", "2026-10-13"):
        by_date = _bridge_days(_etanim_tail_payload(advisory_observed_on=observed_on))
        assert by_date["2026-10-12"]["biblical"]["day"] == 30
        assert by_date["2026-10-12"]["biblical"]["month_id"] == "etanim"
        assert by_date["2026-10-12"]["month_status"] == "confirmed"
        bul = by_date["2026-10-18"]
        assert bul["biblical"]["day"] == 6
        assert bul["biblical"]["month_id"] == "bul"
        assert bul["biblical"]["month_ordinal"] == 8
        assert bul["month_status"] == "pending"
        assert bul["confirmation_id"] is None
        pending = [
            day
            for day in by_date.values()
            if day["biblical"]["day"] is not None and day["month_status"] == "pending"
        ]
        assert pending
        assert all(day["biblical"]["month_id"] == "bul" for day in pending)
        assert all(day["confirmation_id"] is None for day in pending)


def test_omer_family_is_not_silently_scheduled():
    policy = ManualAvivDeterminationPolicy((ManualAvivAnchor(starts_on_evening=date(2026, 3, 20)),))
    confirmation = _confirmation(date(2026, 3, 20), "aviv")
    _, days, _ = CalendarBuilder(aviv_policy=policy).build((confirmation,), through=date(2026, 5, 20))
    emitted = {event.event_id for day in days.values() for event in day.events}
    assert "bikurim" not in emitted
    assert "omer" not in emitted
    assert "shavuot" not in emitted
