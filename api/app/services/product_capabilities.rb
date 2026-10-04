class ProductCapabilities
  def self.call(user = nil)
    flags = FeatureFlags.evaluate(user)
    providers = flags["ai_provider_connections"] ? CommentaryProvider.available_providers : []
    shared = flags["ai_shared_openrouter"] && CommentaryProvider.shared_openrouter? && shared_available?
    development = flags["ai_shared_openrouter"] && (CommentaryProvider.development_openrouter? || DevelopmentSandbox.enabled?)
    connected = user && user.provider_connections.where(provider: providers).exists?
    {flags: flags, ai: {available: !!(shared || development || connected),
      shared_openrouter: !!(shared || development), providers: providers}}
  end

  def self.shared_available?
    RateLimit.available?("shared-ai/minute", limit: 20) &&
      RateLimit.available?("shared-ai/day", limit: daily_limit, period: 86400)
  end

  def self.daily_limit
    ENV.fetch("SHARED_AI_DAILY_LIMIT", "50").to_i.clamp(1, 1000)
  end

  def self.reserve_shared!(user)
    RateLimit.transaction do
      RateLimit.check!("shared-ai/user/#{user.id}", limit: 3)
      RateLimit.check!("shared-ai/minute", limit: 20)
      RateLimit.check!("shared-ai/day", limit: daily_limit, period: 86400)
    end
  end
end
