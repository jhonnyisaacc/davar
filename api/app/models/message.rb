class Message < ApplicationRecord
  belongs_to :conversation
  encrypts :content, :context, :citations
  serialize :context, coder: JSON
  serialize :citations, coder: JSON
  validates :role, inclusion: {in: %w[user assistant]}
  validates :content, presence: true, length: {maximum: 16000}
end
