require "test_helper"
class ApiTest < ActionDispatch::IntegrationTest
  include EnabledProductFeatures
  def login(user)
    _, token = Session.issue!(user)
    {"Authorization"=>"Bearer #{token}"}
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
    get "/api/v1/calendar/today", params: {instant: "2026-09-30T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem"}
    assert_response :success
    get "/api/v1/assemblies", params: {kind: "online"}
    assert_response :unauthorized
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
    get "/api/v1/calendar/today", params: {instant: "0001-01-01T12:00:00Z", latitude: 31.78, longitude: 35.23, timezone: "Asia/Jerusalem"}
    assert_response :unprocessable_entity
  end

end
