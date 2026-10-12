from html import escape
from feed_bridge import parse_feed
from calendar.sources.israeli_new_moon_society import hash_content


def parse(html, **options):
    return parse_feed({
        "fetched_at": "2026-10-03T12:00:00+00:00",
        "rss_xml": f"<rss><channel><item><guid>synthetic</guid><link>https://example.test</link><title>Parser test</title><description>{escape(html)}</description></item></channel></rss>",
        **options,
    })["entries"][0]


def test_partial_report_requires_review_instead_of_replacing_evidence():
    html = """<table><tr><th>observer</th><th>location</th><th>unaided seeing</th></tr>
    <tr><td>12/9/2026</td></tr><tr><td>Valid witness</td><td>Jerusalem</td><td>18:54</td></tr></table>
    <table><tr><th>observer</th><th>location</th><th>unaided seeing</th></tr>
    <tr><td>Missing date</td><td>Jerusalem</td><td>18:54</td></tr></table>"""
    report = parse(html)
    assert report["parse_status"] == "requires_review"
    assert report["observations"] == []


def test_prediction_without_observation_table_never_becomes_evidence():
    report = parse("<p>The moon may be visible on 12/9/2026 at 18:54.</p>")
    assert report["parse_status"] == "ok"
    assert report["observations"] == []


def test_rails_utc_timestamp_is_normalized_for_the_parser():
    result = parse_feed({
        "fetched_at": "2026-10-03T12:00:00Z",
        "rss_xml": """<rss><channel><item><guid>synthetic</guid>
        <link>https://example.test</link><title>Parser test</title>
        <description>&lt;table&gt;&lt;tr&gt;&lt;td&gt;12/9/2026&lt;/td&gt;&lt;/tr&gt;
        &lt;tr&gt;&lt;th&gt;observer&lt;/th&gt;&lt;th&gt;location&lt;/th&gt;&lt;th&gt;unaided seeing&lt;/th&gt;&lt;/tr&gt;
        &lt;tr&gt;&lt;td&gt;Witness&lt;/td&gt;&lt;td&gt;Jerusalem&lt;/td&gt;&lt;td&gt;18:54&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</description>
        </item></channel></rss>""",
    })
    report = result["entries"][0]
    assert report["parse_status"] == "ok"
    assert report["observations"][0]["fetched_at"] == "2026-10-03T12:00:00+00:00"


def test_reviewed_date_recovers_witnesses_only_for_the_reviewed_revision():
    html = """<table><tr><th>observer</th><th>location</th><th>unaided seeing</th></tr>
    <tr><td>Witness</td><td>Jerusalem</td><td>19:37</td></tr></table>"""
    review = {"source_url": "https://example.test", "content_hash": hash_content(html),
              "observed_on": "2026-06-16", "note": "Synthetic reviewed date"}
    recovered = parse(html, report_reviews=[review])
    assert recovered["parse_status"] == "ok"
    assert recovered["observations"][0]["observed_on"] == "2026-06-16"
    assert recovered["observations"][0]["date_review"] == review
    changed = parse(html + "<p>Corrected report.</p>", report_reviews=[review])
    assert changed["parse_status"] == "requires_review"
    assert changed["observations"] == []


def test_reviewed_date_without_witnesses_does_not_create_a_confirmation():
    html = "<p>Visibility forecast for 20/3/2026.</p>"
    review = {"source_url": "https://example.test", "content_hash": hash_content(html),
              "observed_on": "2026-03-20"}
    assert parse(html, report_reviews=[review])["observations"] == []
