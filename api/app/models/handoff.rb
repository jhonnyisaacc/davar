class Handoff < ApplicationRecord
  belongs_to :session
  encrypts :token
end
