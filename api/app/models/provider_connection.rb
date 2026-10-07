class ProviderConnection < ApplicationRecord
  belongs_to :user
  encrypts :credential
  validates :provider, inclusion: {in: %w[claude muse grok chatgpt gemini]}
  validates :credential, :model, presence: true
end
