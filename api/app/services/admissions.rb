class Admissions
  def self.required?
    ENV.fetch("INVITE_GATE_ENABLED", "true") != "false"
  end
  def self.redeem!(user, value)
    User.transaction do
      user.lock!
      return if user.admitted_at
      code = AccessCode.lock.find_by(code_digest: AccessCode.digest(value))
      raise DomainError.new("invalid_code", 403) unless code && !code.revoked_at && code.expires_at > Time.current && code.uses < code.max_uses
      code.increment!(:uses)
      user.update!(admitted_at: Time.current)
    end
  end
end
