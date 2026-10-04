require "net/http"

class FeatureFlags
  KEYS = %w[ai_provider_connections ai_shared_openrouter assemblies].freeze
  DEFAULTS = KEYS.to_h { |key| [key, false] }.freeze

  def self.evaluate(user = nil)
    token = ENV["POSTHOG_PROJECT_TOKEN"].to_s.strip
    return DEFAULTS.dup if token.empty?
    host = ENV.fetch("POSTHOG_HOST", "https://us.i.posthog.com")
    return DEFAULTS.dup unless %w[https://us.i.posthog.com https://eu.i.posthog.com].include?(host)
    distinct_id = "davar/#{user&.id || 'anonymous'}"
    cache_key = "davar/flags/#{Digest::SHA256.hexdigest(token)}/#{Rails.env}/#{distinct_id}"
    Rails.cache.fetch(cache_key, expires_in: 30.seconds) do
      payload = ProviderHttp.json("#{host}/flags?v=2", method: :post, open_timeout: 2, read_timeout: 3,
        body: {api_key: token, distinct_id: distinct_id, person_properties: {environment: Rails.env.to_s},
          flag_keys_to_evaluate: KEYS, disable_geoip: true})
      raise DomainError.new("flags_unavailable", 503) unless payload.is_a?(Hash)
      raise DomainError.new("flags_unavailable", 503) if payload["errorsWhileComputingFlags"] || Array(payload["quotaLimited"]).include?("feature_flags")
      flags = payload["flags"]
      KEYS.to_h { |key| [key, flags.is_a?(Hash) && flags[key].is_a?(Hash) && flags[key]["enabled"] == true] }
    end
  rescue DomainError, OpenSSL::SSL::SSLError, ArgumentError, TypeError
    DEFAULTS.dup
  end

  def self.require!(key, user = nil)
    raise DomainError.new("feature_unavailable", 503) unless evaluate(user)[key]
  end
end
