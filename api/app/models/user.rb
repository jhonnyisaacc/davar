class User < ApplicationRecord
  encrypts :display_name, :profile
  serialize :profile, coder: JSON
  has_many :identities, dependent: :destroy
  has_many :sessions, dependent: :destroy
  has_many :memberships, dependent: :destroy
  has_many :conversations, dependent: :destroy
  has_many :provider_connections, dependent: :destroy
  has_many :notifications, dependent: :destroy
  validates :display_name, length: {maximum: 100}
  def doctrinal_agreement?
    data = profile || {}
    data["experience"] != "starting" && %w[1 2 3 4 5 6 7].all? { |key| data.fetch("answers", {})[key] == true }
  end
  def age
    born = Date.iso8601(profile.fetch("birth_date"))
    return nil if born > Date.current
    Date.current.year - born.year - (([Date.current.month, Date.current.day] <=> [born.month, born.day]) == -1 ? 1 : 0)
  rescue KeyError, ArgumentError, NoMethodError
    nil
  end
  def telegram_contact
    identity = identities.find { |item| item.provider == "telegram" }
    identity ? "tg://user?id=#{identity.subject}" : nil
  end
  def completed_onboarding?
    data = profile || {}
    required = data["experience"] == "starting" ? %w[1 3] : %w[1 2 3 4 5 6 7]
    data["city"].present? && data["gender"].in?(%w[male female]) &&
      data["experience"].in?(%w[starting experienced leader]) &&
      data.fetch("answers", {}).keys.sort == required.sort && data["visibility_reviewed"] == true
  end
end
