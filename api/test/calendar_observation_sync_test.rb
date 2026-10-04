require "test_helper"
require "cgi"

class CalendarObservationSyncTest < ActiveSupport::TestCase
  def table(rows, day: "12/9/2026")
    "<table><tr><td>#{day}</td></tr><tr><th>observer</th><th>location</th><th>unaided seeing</th><th>aided seeing</th></tr>#{rows}</table>"
  end

  def row(observer, location = "Jerusalem", unaided = "18:54", aided = "")
    "<tr><td>#{observer}</td><td>#{location}</td><td>#{unaided}</td><td>#{aided}</td></tr>"
  end

  def feed(html, id: "report-one")
    "<rss><channel><item><guid>#{id}</guid><link>https://moonsocil.blogspot.com/#{id}</link><title>Synthetic parser test</title><description>#{CGI.escapeHTML(html)}</description></item></channel></rss>"
  end

  def sync(html, **options)
    CalendarObservationSync.call(rss_xml: feed(html), **options)
  end

  def calendar
    BiblicalCalendar.call(instant: "2026-09-13T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")
  end

  test "multiple witnesses confirm once, replay unchanged, and expose public evidence" do
    html = table(row("Witness A") + row("Witness B") + row("Aided", "Jerusalem", "", "18:50") + row("Foreign", "Texas"))
    report = sync(html)
    assert_equal 4, report[:observations]
    assert_equal 1, MonthConfirmation.count
    assert_equal 1, CalendarSourceEntry.count
    id = MonthConfirmation.first.id
    assert_no_difference ["NewMoonObservation.count", "MonthConfirmation.count", "CalendarSourceEntry.count"] do
      assert_equal 0, sync(html)[:changed]
    end
    assert_equal id, MonthConfirmation.first.id
    result = calendar
    assert_equal 1, result["days"][0]["biblical"]["day"]
    assert_equal ["Witness A", "Witness B"], result["days"][0]["observation"][:observers].sort
    assert_equal "unresolved", result["year_start_status"]
    assert_equal "etanim", result["days"][0]["biblical"]["month_id"]
    assert_equal "manual", result["days"][0]["month_identity"]["status"]
    assert_equal "ok", result["source"][:status]
    assert Time.iso8601(result["next_sunset_at"]) > Time.iso8601("2026-09-13T12:00:00Z")
  end

  test "corrected reports retract missing witnesses, retain evidence, and reuse remaining confirmation" do
    sync(table(row("Witness A") + row("Witness B")))
    id = MonthConfirmation.first.id
    sync(table(row("Witness B")))
    assert_equal 2, NewMoonObservation.count
    assert_equal 1, NewMoonObservation.where(verified: true).count
    assert NewMoonObservation.where(verified: false).first.provenance["retracted_at"]
    assert_equal id, MonthConfirmation.first.id
    assert_equal ["Witness B"], calendar["days"][0]["observation"][:observers]
    sync("<p>Report withdrawn; no confirmed sighting.</p>")
    assert_equal 0, MonthConfirmation.count
    assert_nil calendar["days"][0]["biblical"]["day"]
    sync(table(row("Witness A")))
    assert_equal 1, MonthConfirmation.count
  end

  test "later sightings within a report and repeated reports do not start extra months" do
    rows = row("First") + "<tr><td>13/9/2026</td></tr>" + row("Later")
    sync(table(rows))
    assert_equal [Date.new(2026, 9, 12)], MonthConfirmation.pluck(:starts_on_evening)
    CalendarObservationSync.call(rss_xml: feed(table(row("Another")), id: "report-two"))
    assert_equal 1, MonthConfirmation.count
    assert_equal 2, CalendarSourceEntry.count
  end

  test "aided and foreign observations never confirm" do
    sync(table(row("Aided", "Jerusalem", "", "18:50") + row("Foreign", "Texas")))
    assert_equal 2, NewMoonObservation.count
    assert_equal 0, MonthConfirmation.count
  end

  test "confirmed day advances at the supplied local sunset boundary" do
    sync(table(row("Witness A")))
    before = calendar
    boundary = Time.iso8601(before["next_sunset_at"])
    after = BiblicalCalendar.call(instant: (boundary + 1.second).iso8601, latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")
    assert_equal 1, before["days"][0]["biblical"]["day"]
    assert_equal 2, after["days"][0]["biblical"]["day"]
    assert Time.iso8601(after["next_sunset_at"]) > boundary
  end

  test "explicit sandbox scenarios never overwrite or leak into live observations" do
    sync(table(row("Witness A")))
    original = DevelopmentSandbox.method(:enabled?)
    DevelopmentSandbox.define_singleton_method(:enabled?) { true }
    DevelopmentFixtures.calendar!("confirmed")
    assert calendar["source"][:development_fixture]
    assert_equal 1, MonthConfirmation.count
    DevelopmentFixtures.calendar!("pending")
    assert_nil calendar["days"][0]["biblical"]["day"]
    assert_equal 1, MonthConfirmation.count
    # A development-only scenario flag is ignored by ordinary/live consumers.
    DevelopmentSandbox.define_singleton_method(:enabled?) { false }
    assert_equal 1, calendar["days"][0]["biblical"]["day"]
    assert_not calendar["source"][:development_fixture]
  ensure
    DevelopmentSandbox.define_singleton_method(:enabled?, original) if original
  end

  test "guarded sync skips recent attempts but explicit sync still applies corrections" do
    now = Time.iso8601("2026-10-11T16:00:00Z")
    sync(table(row("Witness A")), now: now)
    assert_nil sync(table(row("Witness B")), now: now + 1.minute, if_due: true)
    assert_equal ["Witness A"], calendar["days"][0]["observation"][:observers]
    sync(table(row("Witness B")), now: now + 2.minutes)
    assert_equal ["Witness B"], calendar["days"][0]["observation"][:observers]
    assert_nil sync(table(row("Witness C")), now: now + 17.minutes, if_due: true)
    sync(table(row("Witness C")), now: now + 32.minutes, if_due: true)
    assert_equal ["Witness C"], calendar["days"][0]["observation"][:observers]
  end

  test "automatic polling waits for Israel sunset near the lunar month end" do
    assert CalendarObservationWindow.open?(now: Time.iso8601("2026-09-13T12:00:00Z"))
    sync(table(row("Witness A")), now: Time.iso8601("2026-09-13T12:00:00Z"))
    assert_nil sync(table(row("Midmonth")), now: Time.iso8601("2026-10-03T22:00:00Z"), if_due: true)
    assert_not CalendarObservationWindow.open?(now: Time.iso8601("2026-10-11T14:20:00Z"))
    assert CalendarObservationWindow.open?(now: Time.iso8601("2026-10-11T16:00:00Z"))
    assert CalendarObservationWindow.open?(now: Time.iso8601("2026-10-14T12:00:00Z"))
    sync(table(row("Next month"), day: "12/10/2026"), now: Time.iso8601("2026-10-13T12:00:00Z"))
    assert_not CalendarObservationWindow.open?(now: Time.iso8601("2026-10-14T12:00:00Z"))
  end

  test "uncertain changed tables retain valid evidence for review" do
    sync(table(row("Witness A")))
    sync(table(row("Witness B"), day: "Unknown observation date"))
    assert_equal 1, NewMoonObservation.count
    assert_equal 1, MonthConfirmation.count
    assert_equal "requires_review", CalendarFeedState.current.status
    assert_equal 1, CalendarFeedState.current.details["review_count"]
    assert_equal "parser_uncertain", CalendarSourceEntry.first.reason
  end

  test "source stays current between observation windows and becomes stale if boundary updates stop" do
    sync(table(row("Witness A")), now: Time.iso8601("2026-09-13T12:00:00Z"))
    state = CalendarFeedState.current
    assert_not state.consumer_status(now: Time.iso8601("2026-10-03T22:00:00Z"))[:stale]
    assert state.consumer_status(now: Time.iso8601("2026-10-11T16:00:00Z"))[:stale]
    state.update!(status: "source_unavailable")
    assert state.consumer_status(now: Time.iso8601("2026-10-03T22:00:00Z"))[:stale]
  end

  test "historical witness backfill reconstructs Aviv festivals without treating forecasts as sightings" do
    url = "https://moonsocil.blogspot.com/2026/03/new-moon-nissan-5786.html"
    rss = feed("<p>Forecast only.</p>").sub("https://moonsocil.blogspot.com/report-one", url)
    CalendarObservationSync.call(rss_xml: rss)
    assert_equal [Date.new(2026, 3, 20)], MonthConfirmation.pluck(:starts_on_evening)
    result = BiblicalCalendar.call(instant: "2026-04-03T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")
    assert_equal "aviv", result["days"][0]["biblical"]["month_id"]
    assert_equal 14, result["days"][0]["biblical"]["day"]
    assert_includes result["days"][0]["events"], "pesach"
    assert result["days"][0]["observation"][:source_url].start_with?("https://docs.google.com/spreadsheets/")
    bikurim = BiblicalCalendar.call(instant: "2026-04-05T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")["days"][0]
    assert_includes bikurim["events"], "bikurim"
    assert_equal 16, bikurim["biblical"]["day"]
    shavuot = BiblicalCalendar.call(instant: "2026-05-24T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem")["days"][0]
    assert_nil shavuot["biblical"]["day"]
    assert_equal "pending", shavuot["month_status"]
    assert_includes shavuot["events"], "shavuot"
    assert_equal 50, shavuot["counted_events"].sole["day_of_count"]
    assert_equal "2026-04-05", shavuot["counted_events"].sole["wave_sheaf_civil_date"]
    sunset_params = {latitude: -34.6, longitude: -58.4, timezone: "America/Argentina/Buenos_Aires"}
    before = BiblicalCalendar.call(**sunset_params, instant: "2026-05-23T19:00:00Z")["days"][0]
    after = BiblicalCalendar.call(**sunset_params, instant: "2026-05-23T22:00:00Z")["days"][0]
    assert_not_includes before["events"], "shavuot"
    assert_includes after["events"], "shavuot"
    id = MonthConfirmation.sole.id
    assert_no_difference ["NewMoonObservation.count", "MonthConfirmation.count"] do
      CalendarObservationSync.call(rss_xml: rss)
    end
    assert_equal id, MonthConfirmation.sole.id
  end

  test "unavailable malformed and empty feeds retain the last good observations" do
    sync(table(row("Witness A")))
    last_success = CalendarFeedState.current.last_success_at
    fail_fetch = -> { raise DomainError.new("calendar_feed_unavailable", 503) }
    report = CalendarObservationSync.call(fetcher: fail_fetch)
    assert_equal "source_unavailable", report[:status]
    assert_equal last_success, CalendarFeedState.current.last_success_at
    assert calendar["source"][:stale]
    ["broken xml", "<rss><channel/></rss>"].each do |xml|
      assert_equal "source_unavailable", CalendarObservationSync.call(rss_xml: xml)[:status]
      assert_equal 1, MonthConfirmation.count
    end
    assert_equal "ok", sync(table(row("Witness A")))[:status]
  end
end
