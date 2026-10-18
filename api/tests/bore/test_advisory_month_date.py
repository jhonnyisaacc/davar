from datetime import date

from calendar.sources.advisory_month_date import (
    RENEWED_MOON_URL,
    WHEN_IS_THE_NEW_MOON_URL,
    advisory_observed_on,
)

ISRAEL_CONFIRMED = """
<div class="method-summary method-summary--global">
  <span class="status-pill status-confirmed">CONFIRMED</span>
  <div class="method-summary__date">October 11, 2026</div>
</div>
<div class="method-summary method-summary--israel">
  <span class="status-pill status-confirmed">CONFIRMED</span>
  <div class="method-summary__date">October 12, 2026</div>
</div>
</section>
"""

ISRAEL_UNCONFIRMED = """
<div class="method-summary method-summary--israel">
  <span class="status-pill status-expected">EXPECTED</span>
  <div class="method-summary__date">November 11, 2026</div>
</div>
</section>
<div class="method-summary method-summary--global">
  <span class="status-pill status-confirmed">CONFIRMED</span>
  <div class="method-summary__date">October 11, 2026</div>
</div>
"""

SIGHTED = "<p>Date Sighted: Monday, October 12th, 2026</p>"


def test_israel_report_date_wins_over_the_global_date():
    found = advisory_observed_on(
        {
            RENEWED_MOON_URL: ISRAEL_CONFIRMED,
            WHEN_IS_THE_NEW_MOON_URL: "<p>Date Sighted: Monday, October 13th, 2026</p>",
        }
    )
    assert found == date(2026, 10, 12)


def test_unconfirmed_israel_page_falls_back_to_the_sighted_date():
    found = advisory_observed_on(
        {
            RENEWED_MOON_URL: ISRAEL_UNCONFIRMED,
            WHEN_IS_THE_NEW_MOON_URL: SIGHTED,
        }
    )
    assert found == date(2026, 10, 12)


def test_missing_or_failed_reports_return_no_date():
    assert advisory_observed_on({}) is None
    assert advisory_observed_on({RENEWED_MOON_URL: ISRAEL_UNCONFIRMED, WHEN_IS_THE_NEW_MOON_URL: "<p>no date</p>"}) is None

    def explode(url: str) -> str:
        raise OSError(url)

    assert advisory_observed_on(fetch=explode) is None
