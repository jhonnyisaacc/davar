require "test_helper"

class SharedAiTest < ActiveSupport::TestCase
  include EnabledProductFeatures
  setup do
    @env = ENV.to_h.slice("OPENROUTER_API_KEY", "SHARED_OPENROUTER_MODEL", "SHARED_AI_DAILY_LIMIT")
    ENV["OPENROUTER_API_KEY"] = "test-server-key"
    ENV["SHARED_OPENROUTER_MODEL"] = "openrouter/free"
    ENV["SHARED_AI_DAILY_LIMIT"] = "50"
    @user = User.create!
    @conversation = @user.conversations.create!
    commentary_article
    @http = ProviderHttp.method(:json)
    @requests = []
    requests = @requests
    ProviderHttp.define_singleton_method(:json) do |url, **options|
      requests << {url: url, **options}
      {"choices" => [{"message" => {"content" => '{"answer":"Supplied evidence.","source_ids":["fixture:commentary"]}'}}]}
    end
  end
  teardown do
    ProviderHttp.define_singleton_method(:json, @http)
    %w[OPENROUTER_API_KEY SHARED_OPENROUTER_MODEL SHARED_AI_DAILY_LIMIT].each { |key| @env.key?(key) ? ENV[key] = @env[key] : ENV.delete(key) }
  end
  def ask(id = "shared_001")
    Commentary.ask!(conversation: @conversation, content: "Study", context: commentary_context, request_id: id)
  end

  test "approved personal connections take precedence and disabled connections fall back to shared free AI" do
    @user.provider_connections.create!(provider: "chatgpt", credential: "test-personal-key", model: "personal-model")
    answer = ask
    assert_equal "chatgpt", answer.generation["provider"]
    assert_empty RateLimit.where("bucket LIKE ?", "shared-ai/%")
    @product_flags["ai_provider_connections"] = false
    answer = ask("shared_002")
    assert_equal "openrouter", answer.generation["provider"]
    assert_equal "openrouter/free", @requests.last[:body][:model]
    assert_equal({max_price: {prompt: 0, completion: 0}}, @requests.last[:body][:provider])
    assert_equal "Bearer test-server-key", @requests.last[:headers]["Authorization"]
    assert_not_includes answer.to_json, "test-server-key"
    assert_equal answer.id, ask("shared_002").id
    assert_equal 2, @requests.length
    @product_flags["ai_shared_openrouter"] = false
    assert_no_difference "Message.count" do
      assert_equal "ai_unavailable", assert_raises(DomainError) { ask("shared_003") }.code
    end
  end

  test "only configured approved providers are usable" do
    @user.provider_connections.create!(provider: "chatgpt", credential: "test-personal-key", model: "personal-model")
    CommentaryProvider.define_singleton_method(:available_providers) { [] }
    @product_flags["ai_shared_openrouter"] = false
    assert_raises(DomainError) { ask }
    assert_empty @requests
    CommentaryProvider.define_singleton_method(:available_providers, @original_available_providers)
    ENV["AI_CONNECTION_PROVIDERS"] = "muse,chatgpt,unknown,chatgpt, claude"
    assert_equal %w[chatgpt claude], CommentaryProvider.available_providers
  ensure
    ENV.delete("AI_CONNECTION_PROVIDERS")
  end

  test "daily exhaustion and user rate limits stop provider calls and expose article fallback" do
    travel_to Time.utc(2026, 10, 3, 12, 0, 10)
    RateLimit.check!("shared-ai/day", limit: 50, period: 86400)
    RateLimit.find_by!(bucket: "shared-ai/day/#{Time.current.to_i / 86400}").update!(attempts: 50)
    assert_not ProductCapabilities.call[:ai][:available]
    assert_equal "rate_limited", assert_raises(DomainError) { ask }.code
    assert_empty @requests
    assert_not RateLimit.exists?(bucket: "shared-ai/minute/#{Time.current.to_i / 60}")
    RateLimit.delete_all
    3.times { |index| ask("limited_00#{index}") }
    assert_equal "rate_limited", assert_raises(DomainError) { ask("shared_004") }.code
    assert_equal 3, @requests.length
    travel 1.minute do
      assert_equal "complete", ask("shared_005").state
    end
    assert_equal 0, @user.reload.free_consultations
  end

  test "missing authorized evidence does not call or consume shared AI" do
    Article.delete_all
    assert_equal "complete", ask.state
    assert_empty @requests
    assert_empty RateLimit.where("bucket LIKE ?", "shared-ai/%")
  end
end
