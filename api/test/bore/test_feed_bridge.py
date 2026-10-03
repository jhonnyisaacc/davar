from html import escape
from feed_bridge import parse_feed


def parse(html):
    return parse_feed({
        "fetched_at": "2026-10-03T12:00:00+00:00",
        "rss_xml": f"<rss><channel><item><guid>synthetic</guid><link>https://example.test</link><title>Parser test</title><description>{escape(html)}</description></item></channel></rss>",
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
