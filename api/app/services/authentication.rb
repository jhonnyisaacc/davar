class Authentication
  def self.start!(provider:, return_uri:, email: nil, user: nil, notification_consent: false)
    raise DomainError.new("invalid_notification_consent") if notification_consent && (provider != "telegram" || !user)
    allowed = ENV.fetch("AUTH_RETURN_URIS", "davar://auth/callback").split(",")
    raise DomainError.new("invalid_return_uri") unless allowed.include?(return_uri)
    raise DomainError.new("provider_not_configured", 503) unless provider == "email" || OauthProviders.available?(provider)
    state = SecureRandom.urlsafe_base64(48)
    attempt = AuthAttempt.create!(provider: provider, return_uri: return_uri, user: user, notification_consent_requested: notification_consent,
      state_digest: Digest::SHA256.hexdigest(state), nonce: SecureRandom.urlsafe_base64(32),
      verifier: SecureRandom.urlsafe_base64(48), expires_at: 10.minutes.from_now)
    if provider == "email"
      normalized = email.to_s.strip.downcase
      raise DomainError.new("invalid_email") unless normalized.match?(URI::MailTo::EMAIL_REGEXP) && normalized.length <= 254
      attempt.update!(email: normalized)
      MagicLinkMailer.sign_in(attempt, state).deliver_now
      {email_sent: true}
    else
      {authorization_url: OauthProviders.authorization(attempt, state)}
    end
  end
  def self.finish!(provider:, state:, code: nil)
    raise DomainError.new("invalid_state", 401) if state.blank?
    attempt = AuthAttempt.find_by!(state_digest: Digest::SHA256.hexdigest(state), provider: provider)
    attempt.with_lock do
      raise DomainError.new("expired_or_used_link", 401) if attempt.consumed_at || attempt.expires_at <= Time.current
      subject = provider == "email" ? attempt.email : OauthProviders.subject!(attempt, code)
      user = Accounts.resolve!(provider: provider, subject: subject, linking_user: attempt.user)
      user.with_lock { user.update!(settings: user.settings.merge("telegram_notifications"=>true), settings_version: user.settings_version + 1) } if attempt.notification_consent_requested
      session, token = Session.issue!(user)
      handoff_code = SecureRandom.urlsafe_base64(48)
      Handoff.create!(session: session, code_digest: Digest::SHA256.hexdigest(handoff_code), token: token, expires_at: 1.minute.from_now)
      attempt.update!(consumed_at: Time.current)
      uri = URI(attempt.return_uri)
      uri.query = URI.encode_www_form(code: handoff_code)
      uri.to_s
    end
  end
  def self.exchange!(code)
    raise DomainError.new("invalid_handoff", 401) if code.blank?
    handoff = Handoff.find_by!(code_digest: Digest::SHA256.hexdigest(code))
    handoff.with_lock do
      raise DomainError.new("expired_handoff", 401) if handoff.expires_at <= Time.current || handoff.session.revoked_at
      token = handoff.token
      handoff.destroy!
      token
    end
  end
end
