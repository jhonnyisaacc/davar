class Session < ApplicationRecord
  belongs_to :user
  has_many :handoffs, dependent: :destroy
  def self.issue!(user)
    token = SecureRandom.urlsafe_base64(48)
    [create!(user: user, token_digest: Digest::SHA256.hexdigest(token), expires_at: 30.days.from_now), token]
  end
  def self.authenticate(token)
    return nil if token.blank?
    find_by(token_digest: Digest::SHA256.hexdigest(token), revoked_at: nil)&.then { |session| session if session.expires_at > Time.current }
  end
end
