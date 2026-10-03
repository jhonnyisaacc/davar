require "test_helper"

class DevelopmentOpenrouterTest < ActiveSupport::TestCase
  ENV_KEYS = %w[OPENROUTER_API_KEY OPENROUTER_MODEL FREE_AI_PROVIDER FREE_AI_KEY FREE_AI_MODEL DAVAR_DEV_SANDBOX].freeze

  setup do
    @previous_env = ENV.to_h.slice(*ENV_KEYS)
    ENV_KEYS.each { |key| ENV.delete(key) }
    ENV["OPENROUTER_API_KEY"] = "development-test-key"
    ENV["OPENROUTER_MODEL"] = "fixture/model"
    commentary_article
  end

  teardown do
    ENV_KEYS.each { |key| @previous_env.key?(key) ? ENV[key] = @previous_env[key] : ENV.delete(key) }
  end

  def in_environment(name)
    original = Rails.method(:env)
    Rails.define_singleton_method(:env) { ActiveSupport::EnvironmentInquirer.new(name) }
    yield
  ensure
    Rails.define_singleton_method(:env, original)
  end

  def with_http_response(response = {"choices" => [{"message" => {"content" => '{"answer":"Supplied evidence needs verification.","source_ids":["fixture:commentary"]}'}}]})
    original = ProviderHttp.method(:json)
    requests = []
    ProviderHttp.define_singleton_method(:json) do |url, **options|
      requests << {url: url, **options}
      raise response if response.is_a?(Exception)
      response
    end
    yield requests
  ensure
    ProviderHttp.define_singleton_method(:json, original)
  end

  def ask(conversation, request_id: "request_001", **options)
    Commentary.ask!(conversation: conversation, content: "Explain this passage", context: commentary_context, request_id: request_id, **options)
  end

  test "OpenRouter requires development and both nonblank settings" do
    in_environment("development") do
      assert CommentaryProvider.development_openrouter?
      %w[OPENROUTER_API_KEY OPENROUTER_MODEL].each do |key|
        original = ENV[key]
        [nil, "", " "].each do |value|
          ENV[key] = value
          assert_not CommentaryProvider.development_openrouter?
        end
        ENV[key] = original
      end
    end
    %w[test staging production].each do |name|
      in_environment(name) { assert_not CommentaryProvider.development_openrouter? }
    end
    assert_not CommentaryProvider.supported?("openrouter")
  end

  test "OpenRouter posts the chosen model and grounded messages with bearer authentication" do
    in_environment("development") do
      with_http_response do |requests|
        text = CommentaryProvider.generate(provider: "openrouter", credential: ENV.fetch("OPENROUTER_API_KEY"),
          model: ENV.fetch("OPENROUTER_MODEL"), system: "Authorized evidence only", messages: [{role: "user", content: "Explain"}])
        assert_equal '{"answer":"Supplied evidence needs verification.","source_ids":["fixture:commentary"]}', text
        assert_equal [{url: "https://openrouter.ai/api/v1/chat/completions", method: :post,
          headers: {"Authorization" => "Bearer development-test-key"},
          body: {model: "fixture/model", messages: [{role: "system", content: "Authorized evidence only"}, {role: "user", content: "Explain"}]}}], requests
      end
    end
  end

  test "OpenRouter is rejected before HTTP outside development" do
    with_http_response do |requests|
      %w[test staging production].each do |name|
        in_environment(name) do
          error = assert_raises(DomainError) do
            CommentaryProvider.generate(provider: "openrouter", credential: "development-test-key", model: "fixture/model", system: "Evidence", messages: [])
          end
          assert_equal "provider_not_supported", error.message
        end
      end
      assert_empty requests
    end
  end

  test "development commentary supports followups without quota or a connection and deduplicates retries" do
    user = User.create!(free_consultations: 1)
    conversation = user.conversations.create!(title: "Local study")
    in_environment("development") do
      with_http_response do |requests|
        answer = ask(conversation)
        assert_equal "complete", answer.state
        assert_equal "openrouter", answer.generation["provider"]
        assert_equal "fixture/model", answer.generation["model"]
        assert_equal false, answer.generation["development_simulation"]
        assert_equal({type: "json_object"}, requests.first[:body][:response_format])
        schema = JSON.parse(requests.first[:body][:messages].first[:content].split("Required JSON response schema (format rules, not source evidence): ").last)
        assert_equal ["answer", "source_ids"], schema["required"]
        assert_includes schema["properties"]["source_ids"]["items"]["enum"], "fixture:commentary"
        assert_equal 2, schema["properties"]["answer"]["properties"]["positive"]["maxItems"]
        assert_equal 2, schema["properties"]["answer"]["properties"]["negative"]["maxItems"]
        assert_not_includes JSON.generate(answer.as_json), "development-test-key"
        assert_equal answer.id, ask(conversation).id
        assert_equal 1, requests.length
        followup = ask(conversation, request_id: "request_002")
        assert_equal "complete", followup.state
        assert_equal 2, requests.length
        assert_equal %w[system user assistant user], requests.last[:body][:messages].map { |m| m[:role] }
        assert_includes requests.last[:body][:messages].first[:content], "Answer only from authorized supplied evidence"
        assert_equal 1, user.reload.free_consultations
        assert_empty user.provider_connections
        assert conversation.reload.memory.present?
      end
    end
  end

  test "development OpenRouter overrides personal providers and sandbox AI" do
    user = User.create!
    user.provider_connections.create!(provider: "chatgpt", credential: "personal-test-key", model: "personal-model")
    conversation = user.conversations.create!(title: "Sandbox study")
    ENV["DAVAR_DEV_SANDBOX"] = "1"
    in_environment("development") do
      with_http_response do |requests|
        answer = ask(conversation, provider: "chatgpt")
        assert_equal "openrouter", answer.generation["provider"]
        assert_equal false, answer.generation["development_simulation"]
        assert_equal "Bearer development-test-key", requests.first[:headers]["Authorization"]
        assert_equal 0, user.reload.free_consultations
      end
    end
  end

  test "missing OpenRouter settings preserve sandbox simulation and quota" do
    ENV.delete("OPENROUTER_MODEL")
    ENV["DAVAR_DEV_SANDBOX"] = "1"
    user = User.create!
    conversation = user.conversations.create!(title: "Simulated study")
    in_environment("development") do
      with_http_response do |requests|
        answer = ask(conversation)
        assert_includes answer.content, "Development simulation"
        assert_equal true, answer.generation["development_simulation"]
        assert_equal 1, user.reload.free_consultations
        assert_raises(DomainError) { ask(conversation, request_id: "request_002") }
        assert_empty requests
      end
    end
  end

  test "hosted and test commentary ignore OpenRouter settings and preserve sponsored quota" do
    ENV["FREE_AI_PROVIDER"] = "chatgpt"
    ENV["FREE_AI_KEY"] = "sponsored-test-key"
    ENV["FREE_AI_MODEL"] = "sponsored-model"
    %w[test staging production].each do |name|
      user = User.create!
      conversation = user.conversations.create!(title: "Sponsored study")
      in_environment(name) do
        with_http_response do |requests|
          answer = ask(conversation)
          assert_equal "chatgpt", answer.generation["provider"]
          assert_equal "sponsored-model", answer.generation["model"]
          assert_equal "https://api.openai.com/v1/chat/completions", requests.first[:url]
          assert_equal "Bearer sponsored-test-key", requests.first[:headers]["Authorization"]
          assert_equal 1, user.reload.free_consultations
          assert_raises(DomainError) { ask(conversation, request_id: "request_002") }
          assert_equal 1, requests.length
        end
      end
    end
  end

  test "provider errors and empty or malformed replies fail safely without changing the quota" do
    in_environment("development") do
      [DomainError.new("provider_unavailable", 503), {"choices" => []}, {"choices" => [{"message" => {"content" => ""}}]}].each do |response|
        user = User.create!(free_consultations: 1)
        conversation = user.conversations.create!(title: "Failure")
        with_http_response(response) do
          assert_raises(DomainError) { ask(conversation) }
          assert_equal "failed", conversation.messages.find_by!(request_id: "request_001").state
          assert_equal 1, user.reload.free_consultations
        end
        with_http_response { assert_equal "complete", ask(conversation, request_id: "request_002").state }
      end
    end
  end

  test "recovery of interrupted development requests does not refund an unused quota" do
    user = User.create!(free_consultations: 1)
    conversation = user.conversations.create!(title: "Interrupted")
    interrupted = Class.new do
      def self.generate(**)
        raise Interrupt
      end
    end
    in_environment("development") do
      assert_raises(Interrupt) { ask(conversation, generator: interrupted) }
    end
    message = conversation.messages.find_by!(request_id: "request_001")
    assert_equal false, message.generation["sponsored"]
    message.update!(created_at: 11.minutes.ago)
    RecoverConsultationsJob.perform_now
    assert_equal "failed", message.reload.state
    assert_equal 1, user.reload.free_consultations
  end
end
