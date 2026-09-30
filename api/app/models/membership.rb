class Membership < ApplicationRecord
  belongs_to :user
  belongs_to :assembly
  validates :state, inclusion: {in: %w[requested member declined left]}
end
