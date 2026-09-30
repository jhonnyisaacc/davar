class Conversation < ApplicationRecord
  belongs_to :user
  has_many :messages, dependent: :destroy
  encrypts :title, :memory
end
