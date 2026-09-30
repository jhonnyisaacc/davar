class AccessCode < ApplicationRecord
  validates :max_uses, numericality: {greater_than: 0}
  def self.digest(value)
    Digest::SHA256.hexdigest(value.to_s.delete("-").strip.upcase)
  end
end
