require "test_helper"
class ApiTest < ActionDispatch::IntegrationTest
  include EnabledProductFeatures
  def login(user)
    _, token = Session.issue!(user)
    {"Authorization"=>"Bearer #{token}"}
  end
  def with_calendar_feed
    original = CalendarObservationSync.method(:fetch_feed)
    fetches = []
    xml = '<rss><channel><item><guid>calendar-test</guid><link>https://example.test/moon</link><title>Synthetic observation</title><description><![CDATA[<table><tr><td>12/9/2026</td></tr><tr><th>observer</th><th>location</th><th>unaided seeing</th></tr><tr><td>Witness</td><td>Jerusalem</td><td>18:54</td></tr></table>]]></description></item></channel></rss>'
    CalendarObservationSync.define_singleton_method(:fetch_feed) do
      fetches << Time.current
      xml
    end
    yield fetches
  ensure
    CalendarObservationSync.define_singleton_method(:fetch_feed, original)
  end
  def calendar_params
    {instant: "2026-09-13T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem"}
  end
  test "public provider metadata identifies the development commentary override" do
    original = CommentaryProvider.method(:development_openrouter?)
    [false, true].each do |enabled|
      CommentaryProvider.define_singleton_method(:development_openrouter?) { enabled }
      get "/api/v1/auth/providers"
      assert_response :success
      if enabled
        assert_equal "openrouter", response.parsed_body["commentary_provider"]
      else
        assert_nil response.parsed_body["commentary_provider"]
      end
      assert response.parsed_body["providers"].all? { |provider| provider.keys.sort == %w[available id] }
      assert_equal %w[commentary_provider providers], response.parsed_body.keys.sort
    end
  ensure
    CommentaryProvider.define_singleton_method(:development_openrouter?, original)
  end
  test "public calendar and articles work without an account" do
    get "/api/v1/articles"
    assert_response :success
    with_calendar_feed do
      get "/api/v1/calendar/today", params: calendar_params
      assert_response :success
    end
    get "/api/v1/assemblies", params: {kind: "online"}
    assert_response :unauthorized
  end
  test "public calendar syncs an empty database and refreshes only when due" do
    assert_equal 0, MonthConfirmation.count
    travel_to Time.iso8601("2026-10-11T16:00:00Z")
    with_calendar_feed do |fetches|
      get "/api/v1/calendar/today", params: calendar_params
      assert_response :success
      assert_equal 1, response.parsed_body["days"][0]["biblical"]["day"]
      assert_equal "ok", response.parsed_body["source"]["status"]
      assert_not response.parsed_body["source"]["stale"]
      assert_equal 1, MonthConfirmation.count

      get "/api/v1/calendar/upcoming", params: calendar_params.merge(days: 3)
      assert_response :success
      assert_equal [1, 2, 3], response.parsed_body["days"].map { |day| day["biblical"]["day"] }
      assert_equal 1, fetches.length

      travel 31.minutes do
        get "/api/v1/calendar/today", params: calendar_params
        assert_response :success
        assert_equal 2, fetches.length
        assert_equal 1, MonthConfirmation.count
      end
    end
  end
  test "failed calendar bootstrap returns pending data and bounds retries" do
    original = CalendarObservationSync.method(:fetch_feed)
    attempts = []
    CalendarObservationSync.define_singleton_method(:fetch_feed) do
      attempts << Time.current
      raise DomainError.new("calendar_feed_unavailable", 503)
    end
    2.times do
      get "/api/v1/calendar/today", params: calendar_params
      assert_response :success
      assert_nil response.parsed_body["days"][0]["biblical"]["day"]
      assert_equal "source_unavailable", response.parsed_body["source"]["status"]
    end
    assert_equal 1, attempts.length
    travel 31.minutes do
      with_calendar_feed do |fetches|
        get "/api/v1/calendar/today", params: calendar_params
        assert_response :success
        assert_equal 1, response.parsed_body["days"][0]["biblical"]["day"]
        assert_equal "ok", response.parsed_body["source"]["status"]
        assert_equal 1, fetches.length
      end
    end
  ensure
    CalendarObservationSync.define_singleton_method(:fetch_feed, original)
  end
  test "explicit calendar scenarios do not bootstrap the live feed" do
    original = DevelopmentSandbox.method(:enabled?)
    DevelopmentSandbox.define_singleton_method(:enabled?) { true }
    with_calendar_feed do |fetches|
      %w[confirmed pending].each do |scenario|
        DevelopmentFixtures.calendar!(scenario)
        get "/api/v1/calendar/today", params: calendar_params.merge(instant: Time.current.iso8601)
        assert_response :success
        assert response.parsed_body["source"]["development_fixture"]
        assert_equal "synthetic_#{scenario}", response.parsed_body["source"]["status"]
        assert_nil CalendarFeedState.current.last_attempt_at
      end
      assert_empty fetches
    end
  ensure
    DevelopmentSandbox.define_singleton_method(:enabled?, original)
  end
  test "September 12 seventh-month anchor supplies Etanim and Shemini Atzeret at local sunset" do
    with_calendar_feed do
      params = {latitude: -34.6, longitude: -58.4, timezone: "America/Argentina/Buenos_Aires"}
      get "/api/v1/calendar/today", params: params.merge(instant: "2026-10-03T20:00:00Z")
      assert_response :success
      before = response.parsed_body["days"][0]
      assert_equal 21, before["biblical"]["day"]
      assert_equal "etanim", before["biblical"]["month_id"]
      assert_includes before["events"], "sukkot_last"

      get "/api/v1/calendar/today", params: params.merge(instant: "2026-10-03T22:00:00Z")
      assert_response :success
      after = response.parsed_body["days"][0]
      assert_equal 22, after["biblical"]["day"]
      assert_equal "etanim", after["biblical"]["month_id"]
      assert_includes after["events"], "shemini_atzeret"
      assert_equal "manual", after["month_identity"]["status"]
      assert_equal "2026-09-12", after["month_identity"]["starts_on_evening"]
      assert_equal "unresolved", after["year_start_status"]
      assert_equal({"day" => 23, "month_id" => "tishrei", "year" => 5787}, after["rabbinic"])
    end
  end
  test "conversation ownership and session revocation" do
    first = User.create!(display_name: "First")
    second = User.create!(display_name: "Second")
    conversation = first.conversations.create!(title: "Private")
    get "/api/v1/conversations/#{conversation.id}", headers: login(second)
    assert_response :not_found
    headers = login(first)
    get "/api/v1/conversations/#{conversation.id}", headers: headers
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    delete "/api/v1/auth/session", headers: headers
    assert_response :no_content
    get "/api/v1/account", headers: headers
    assert_response :unauthorized
  end
  test "Assemblies cannot bypass admission or grant leader verification" do
    user = User.create!(display_name: "Reader")
    headers = login(user)
    get "/api/v1/assemblies", params: {kind: "online"}, headers: headers
    assert_response :forbidden
    patch "/api/v1/account", params: {leader_verified: true}, headers: headers, as: :json
    assert_response :success
    assert_not user.reload.leader_verified
  end
  test "notification permission cannot be self granted and can be revoked" do
    user = User.create!(display_name: "Fixture", settings: {telegram_notifications:true})
    headers = login(user)
    patch "/api/v1/account/notification_preferences", params: {enabled:true}, headers: headers, as: :json
    assert_response :unprocessable_entity
    patch "/api/v1/account/notification_preferences", params: {enabled:false}, headers: headers, as: :json
    assert_response :success
    assert_equal false, user.reload.settings["telegram_notifications"]
  end
  test "credentials are never serialized" do
    user = User.create!(display_name: "Reader")
    Identity.create!(user: user, provider: "google", subject: "test-reader")
    post "/api/v1/provider_connections", params: {provider: "chatgpt", credential: "secret-key-value", model: "pinned-model"}, headers: login(user), as: :json
    assert_response :success
    assert_not_includes response.body, "secret-key-value"
  end
  test "pending conversations cannot be deleted during generation" do
    user = User.create!(display_name: "Fixture")
    conversation = user.conversations.create!(title: "Pending")
    conversation.messages.create!(role: "assistant", state: "pending", content: "Pending")
    delete "/api/v1/conversations/#{conversation.id}", headers: login(user)
    assert_response :conflict
    assert Conversation.exists?(conversation.id)
    conversation.messages.update_all(state: "complete")
    delete "/api/v1/conversations/#{conversation.id}", headers: login(user)
    assert_response :no_content
  end
  test "public calendar rejects unbounded years" do
    with_calendar_feed do |fetches|
      get "/api/v1/calendar/today", params: calendar_params.merge(instant: "0001-01-01T12:00:00Z")
      assert_response :unprocessable_entity
      assert_empty fetches
    end
  end

end
