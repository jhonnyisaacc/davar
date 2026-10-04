require "test_helper"

class FeatureAvailabilityTest < ActionDispatch::IntegrationTest
  include EnabledProductFeatures

  setup do
    @product_flags.transform_values! { false }
    @environment = ENV.to_h.slice("OPENROUTER_API_KEY", "OPENROUTER_MODEL", "SHARED_OPENROUTER_MODEL", "AI_CONNECTION_PROVIDERS")
    %w[OPENROUTER_API_KEY OPENROUTER_MODEL SHARED_OPENROUTER_MODEL AI_CONNECTION_PROVIDERS].each { |key| ENV.delete(key) }
    @sandbox = DevelopmentSandbox.method(:enabled?)
    DevelopmentSandbox.define_singleton_method(:enabled?) { false }
    @user = User.create!(admitted_at: Time.current)
    @user.identities.create!(provider: "email", subject: "flags@example.test")
    _, token = Session.issue!(@user)
    @headers = {"Authorization" => "Bearer #{token}"}
  end

  teardown do
    DevelopmentSandbox.define_singleton_method(:enabled?, @sandbox)
    %w[OPENROUTER_API_KEY OPENROUTER_MODEL SHARED_OPENROUTER_MODEL AI_CONNECTION_PROVIDERS].each { |key| @environment.key?(key) ? ENV[key] = @environment[key] : ENV.delete(key) }
  end

  test "closed flags protect assembly endpoints, admission and AI writes while public articles remain readable" do
    article = commentary_article
    ["/api/v1/assemblies", "/api/v1/assemblies/leaders", "/api/v1/endorsements"].each do |path|
      get path, headers: @headers
      assert_response :service_unavailable
      assert_equal "feature_unavailable", response.parsed_body.dig("error", "code")
    end
    post "/api/v1/account/admission", params: {code: "1234567"}, headers: @headers, as: :json
    assert_response :service_unavailable
    assert_no_difference "ProviderConnection.count" do
      post "/api/v1/provider_connections", params: {provider: "chatgpt", credential: "test-private-key", model: "test-model"}, headers: @headers, as: :json
      assert_response :service_unavailable
    end
    assert_no_difference "Conversation.count" do
      post "/api/v1/conversations", params: {title: "Forbidden"}, headers: @headers, as: :json
      assert_response :service_unavailable
    end
    conversation = @user.conversations.create!
    assert_no_difference "Message.count" do
      post "/api/v1/conversations/#{conversation.id}/messages", params: {content: "Study", request_id: "closed_001"}, headers: @headers, as: :json
      assert_response :service_unavailable
    end
    get "/api/v1/articles/#{article.id}"
    assert_response :success
    assert_equal article.attribution, response.parsed_body["attribution"]
  end

  test "capabilities return only usable options and never credentials" do
    ENV["OPENROUTER_API_KEY"] = "server-only-key"
    @user.provider_connections.create!(provider: "chatgpt", credential: "personal-only-key", model: "test-model")
    get "/api/v1/capabilities", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.dig("ai", "available")
    assert_equal "no-store", response.headers["Cache-Control"]
    @product_flags["ai_shared_openrouter"] = true
    get "/api/v1/capabilities"
    assert_equal true, response.parsed_body.dig("ai", "available")
    assert_equal [], response.parsed_body.dig("ai", "providers")
    @product_flags["ai_provider_connections"] = true
    CommentaryProvider.define_singleton_method(:available_providers) { ["chatgpt"] }
    ENV.delete("OPENROUTER_API_KEY")
    get "/api/v1/capabilities", headers: @headers
    assert_equal true, response.parsed_body.dig("ai", "available")
    assert_equal ["chatgpt"], response.parsed_body.dig("ai", "providers")
    assert_not_includes response.body, "only-key"
    post "/api/v1/provider_connections", params: {provider: "claude", credential: "test-private-key", model: "test-model"}, headers: @headers, as: :json
    assert_response :service_unavailable
    get "/api/v1/capabilities"
    assert_equal false, response.parsed_body.dig("ai", "available")
    @product_flags["ai_shared_openrouter"] = true
    ENV["OPENROUTER_API_KEY"] = "server-only-key"
    ENV["SHARED_OPENROUTER_MODEL"] = "paid/model"
    get "/api/v1/capabilities"
    assert_equal false, response.parsed_body.dig("ai", "available")
  end

  test "provider revocation remains possible after release is disabled" do
    connection = @user.provider_connections.create!(provider: "chatgpt", credential: "personal-only-key", model: "test-model")
    delete "/api/v1/provider_connections/#{connection.id}", headers: @headers
    assert_response :no_content
    assert_not ProviderConnection.exists?(connection.id)
  end
end
