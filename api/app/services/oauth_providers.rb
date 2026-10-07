class OauthProviders
  PROVIDERS = {
    "google" => {auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", jwks: "https://www.googleapis.com/oauth2/v3/certs", issuer: "https://accounts.google.com", scope: "openid"},
    "apple" => {auth: "https://appleid.apple.com/auth/authorize", token: "https://appleid.apple.com/auth/token", jwks: "https://appleid.apple.com/auth/keys", issuer: "https://appleid.apple.com", scope: nil},
    "telegram" => {auth: "https://oauth.telegram.org/auth", token: "https://oauth.telegram.org/token", jwks: "https://oauth.telegram.org/.well-known/jwks.json", issuer: "https://oauth.telegram.org", scope: "openid profile"},
    "facebook" => {auth: "https://www.facebook.com/v24.0/dialog/oauth", token: "https://graph.facebook.com/v24.0/oauth/access_token", scope: "public_profile"},
    "x" => {auth: "https://x.com/i/oauth2/authorize", token: "https://api.x.com/2/oauth2/token", scope: "users.read tweet.read"}
  }.freeze
  def self.credentials(provider)
    prefix = provider.upcase
    [ENV["#{prefix}_CLIENT_ID"], ENV["#{prefix}_CLIENT_SECRET"]]
  end
  def self.available?(provider)
    PROVIDERS.key?(provider) && credentials(provider).all?(&:present?)
  end
  def self.callback(provider)
    "#{ENV.fetch("API_PUBLIC_URL", "http://localhost:3000")}/api/v1/auth/#{provider}/callback"
  end
  def self.authorization(attempt, state)
    provider = attempt.provider
    config = PROVIDERS.fetch(provider)
    id, = credentials(provider)
    args = {client_id: id, redirect_uri: callback(provider), response_type: "code", scope: config[:scope], state: state}.compact
    args[:scope] += " telegram:bot_access" if provider == "telegram" && attempt.notification_consent_requested
    args[:nonce] = attempt.nonce if config[:jwks]
    unless provider.in?(%w[apple facebook])
      args.merge!(code_challenge: Base64.urlsafe_encode64(Digest::SHA256.digest(attempt.verifier), padding: false), code_challenge_method: "S256")
    end
    args[:response_mode] = "form_post" if provider == "apple"
    "#{config[:auth]}?#{URI.encode_www_form(args)}"
  end
  def self.subject!(attempt, code, http: ProviderHttp)
    provider = attempt.provider
    config = PROVIDERS.fetch(provider)
    id, secret = credentials(provider)
    form = {grant_type: "authorization_code", code: code, redirect_uri: callback(provider), client_id: id}
    if provider.in?(%w[x telegram])
      form[:code_verifier] = attempt.verifier
      token = http.json(config[:token], method: :post, form: form, basic: [id, secret])
    else
      form[:client_secret] = secret
      form[:code_verifier] = attempt.verifier if provider == "google"
      token = http.json(config[:token], method: :post, form: form)
    end
    if config[:jwks]
      keys = Rails.cache.fetch("jwks/#{provider}", expires_in: 1.hour) { http.json(config[:jwks]) }
      claims, = JWT.decode(token.fetch("id_token"), nil, true, algorithms: ["RS256"], jwks: keys, verify_iss: true, iss: config[:issuer], verify_aud: true, aud: id, verify_expiration: true, required_claims: %w[sub iss aud exp iat])
      raise DomainError.new("invalid_nonce", 401) unless claims["nonce"] == attempt.nonce
      # Telegram OIDC sub is not the legacy Telegram user ID used by Qahal.
      if provider == "telegram"
        raise DomainError.new("telegram_user_id_missing", 401) unless claims["id"].is_a?(Integer) && claims["id"] > 0
        return claims["id"].to_s
      end
      return claims.fetch("sub")
    end
    access = token.fetch("access_token")
    if provider == "x"
      return http.json("https://api.x.com/2/users/me", headers: {"Authorization" => "Bearer #{access}"}).fetch("data").fetch("id")
    end
    proof = OpenSSL::HMAC.hexdigest("SHA256", secret, access)
    http.json("https://graph.facebook.com/v24.0/me?fields=id&appsecret_proof=#{proof}", headers: {"Authorization" => "Bearer #{access}"}).fetch("id")
  rescue JWT::DecodeError, KeyError
    raise DomainError.new("invalid_provider_identity", 401)
  end
end
