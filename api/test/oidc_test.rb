require "test_helper"
class OidcTest < ActiveSupport::TestCase
  test "OIDC validates cryptographic claims and legacy Telegram identity" do
    key = OpenSSL::PKey::RSA.generate(2048)
    jwk = JWT::JWK.new(key)
    claims = {sub: "oidc-subject", id: 987654321, iss: "https://oauth.telegram.org", aud: "fixture-client", exp: 5.minutes.from_now.to_i, iat: Time.current.to_i, nonce: "fixture-nonce"}
    attempt = AuthAttempt.new(provider: "telegram", nonce: "fixture-nonce", verifier: "fixture-pkce")
    old = ENV["TELEGRAM_CLIENT_ID"]
    ENV["TELEGRAM_CLIENT_ID"] = "fixture-client"
    http = Class.new do
      class << self
        attr_accessor :token, :keys
        def json(url, **)
          url.include?("jwks") ? keys : {"id_token"=>token}
        end
      end
    end
    http.keys = {keys: [jwk.export]}
    http.token = JWT.encode(claims, key, "RS256", kid: jwk.kid)
    Rails.cache.clear
    assert_equal "987654321", OauthProviders.subject!(attempt, "fixture-code", http: http)
    http.token = JWT.encode(claims.merge(nonce: "different"), key, "RS256", kid: jwk.kid)
    assert_raises(DomainError) { OauthProviders.subject!(attempt, "fixture-code", http: http) }
    http.token = JWT.encode(claims.merge(aud: "other-app"), key, "RS256", kid: jwk.kid)
    assert_raises(DomainError) { OauthProviders.subject!(attempt, "fixture-code", http: http) }
    http.token = JWT.encode(claims.merge(exp: 1.minute.ago.to_i), key, "RS256", kid: jwk.kid)
    assert_raises(DomainError) { OauthProviders.subject!(attempt, "fixture-code", http: http) }
    unrelated = OpenSSL::PKey::RSA.generate(2048)
    http.token = JWT.encode(claims, unrelated, "RS256", kid: jwk.kid)
    assert_raises(DomainError) { OauthProviders.subject!(attempt, "fixture-code", http: http) }
  ensure
    old ? ENV["TELEGRAM_CLIENT_ID"] = old : ENV.delete("TELEGRAM_CLIENT_ID")
  end
  test "notification permission is separate from ordinary Telegram login" do
    normal = AuthAttempt.new(provider: "telegram", nonce: "nonce", verifier: "pkce", notification_consent_requested: false)
    assert_not_includes URI.decode_www_form(URI(OauthProviders.authorization(normal, "state")).query).to_h["scope"], "telegram:bot_access"
    normal.notification_consent_requested = true
    assert_includes URI.decode_www_form(URI(OauthProviders.authorization(normal, "state")).query).to_h["scope"], "telegram:bot_access"
  end
end
