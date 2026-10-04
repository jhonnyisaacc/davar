require "test_helper"

class FeatureFlagsTest < ActiveSupport::TestCase
  setup do
    @env = ENV.to_h.slice("POSTHOG_PROJECT_TOKEN", "POSTHOG_HOST")
    ENV["POSTHOG_PROJECT_TOKEN"] = "test-project-token"
    ENV["POSTHOG_HOST"] = "https://us.i.posthog.com"
    @cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    @http = ProviderHttp.method(:json)
    @requests = []
    @payload = {"flags" => FeatureFlags::KEYS.to_h { |key| [key, {"enabled" => true}] }}
    requests, test = @requests, self
    ProviderHttp.define_singleton_method(:json) do |url, **options|
      requests << {url: url, **options}
      payload = test.instance_variable_get(:@payload)
      raise payload if payload.is_a?(Exception)
      payload
    end
  end

  teardown do
    ProviderHttp.define_singleton_method(:json, @http)
    Rails.cache = @cache
    %w[POSTHOG_PROJECT_TOKEN POSTHOG_HOST].each { |key| @env.key?(key) ? ENV[key] = @env[key] : ENV.delete(key) }
  end

  test "evaluation is bounded and cached by account and environment without personal content" do
    user = User.create!(display_name: "Private name")
    assert FeatureFlags.evaluate(user).values.all?
    assert FeatureFlags.evaluate(user).values.all?
    assert_equal 1, @requests.length
    request = @requests.first
    assert_equal "https://us.i.posthog.com/flags?v=2", request[:url]
    assert_equal 2, request[:open_timeout]
    assert_equal 3, request[:read_timeout]
    assert_equal "davar/#{user.id}", request[:body][:distinct_id]
    assert_equal({environment: "test"}, request[:body][:person_properties])
    assert_equal FeatureFlags::KEYS, request[:body][:flag_keys_to_evaluate]
    assert_not_includes request[:body].to_json, "Private name"
    FeatureFlags.evaluate(User.create!)
    assert_equal 2, @requests.length
    travel 31.seconds do
      @payload = {"flags" => {}}
      assert_equal FeatureFlags::DEFAULTS, FeatureFlags.evaluate(user)
    end
  end

  test "missing configuration, errors, partial responses and quota fail closed" do
    ENV.delete("POSTHOG_PROJECT_TOKEN")
    assert_equal FeatureFlags::DEFAULTS, FeatureFlags.evaluate
    assert_empty @requests
    ENV["POSTHOG_PROJECT_TOKEN"] = "test-project-token"
    [nil, [], {"errorsWhileComputingFlags" => true, "flags" => @payload["flags"]},
      {"quotaLimited" => ["feature_flags"], "flags" => @payload["flags"]},
      DomainError.new("provider_unavailable", 503), {"flags" => {"assemblies" => {"enabled" => "true"}}}].each do |payload|
      @payload = payload
      Rails.cache.clear
      assert_equal FeatureFlags::DEFAULTS, FeatureFlags.evaluate
    end
    @payload = {"flags" => {"assemblies" => {"enabled" => true}}}
    Rails.cache.clear
    assert_equal FeatureFlags::DEFAULTS.merge("assemblies" => true), FeatureFlags.evaluate
    ENV["POSTHOG_HOST"] = "https://unexpected.example"
    assert_equal FeatureFlags::DEFAULTS, FeatureFlags.evaluate
  end
end
