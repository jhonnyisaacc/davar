class Identity < ApplicationRecord
  belongs_to :user
  encrypts :subject, deterministic: true
  validates :provider, inclusion: {in: %w[google apple facebook telegram x email]}
  validates :subject, presence: true, uniqueness: {scope: :provider}
end
