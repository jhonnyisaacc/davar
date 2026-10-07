class Endorsement < ApplicationRecord
  belongs_to :applicant, class_name: "User"
  belongs_to :leader, class_name: "User"
  validates :state, inclusion: {in: %w[requested accepted declined]}
end
