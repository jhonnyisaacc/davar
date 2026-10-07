class AccountProfile
  PROFILE_KEYS = %w[experience answers gender birth_date visibility_reviewed].freeze

  def self.update!(user, data, profile = nil)
    if profile
      old = user.profile || {}
      raise DomainError.new("female_leader_forbidden") if profile.fetch("gender", old["gender"]) == "female" && (user.leader_verified || profile.fetch("experience", old["experience"]) == "leader")
      if profile["answers"]
        allowed = QahalProfile.question_ids(profile.fetch("experience", old["experience"]))
        raise DomainError.new("invalid_answers") unless profile["answers"].keys.all? { |key| allowed.include?(key) } && profile["answers"].values.all? { |value| value == true || value == false }
      end
      raise DomainError.new("invalid_gender") if profile["gender"] && !profile["gender"].in?(%w[male female])
      raise DomainError.new("invalid_experience") if profile["experience"] && !profile["experience"].in?(%w[starting experienced leader])
      data[:profile] = old.merge(profile)
    end
    if data["contact_visible"] == true && !user.identities.exists?(provider: "telegram")
      raise DomainError.new("telegram_contact_required")
    end
    user.update!(data)
  end
end
