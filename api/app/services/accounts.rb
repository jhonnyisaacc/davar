class Accounts
  # A provider subject, never an email match, is the canonical linking key.
  def self.resolve!(provider:, subject:, linking_user: nil)
    User.transaction do
      linking_user&.lock!
      identity = Identity.find_by(provider: provider, subject: subject)
      if identity
        raise DomainError.new("identity_already_linked", 409) if linking_user && identity.user_id != linking_user.id
        return identity.user
      end
      user = linking_user || User.create!(display_name: "Reader")
      Identity.create!(user: user, provider: provider, subject: subject)
      user
    end
  rescue ActiveRecord::RecordNotUnique
    retry unless linking_user
    raise DomainError.new("identity_already_linked", 409)
  end
end
