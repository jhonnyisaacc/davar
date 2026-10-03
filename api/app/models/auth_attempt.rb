class AuthAttempt < ApplicationRecord
  belongs_to :user, optional: true
  encrypts :email, :verifier
end
