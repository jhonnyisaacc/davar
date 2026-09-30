class Assembly < ApplicationRecord
  belongs_to :leader, class_name: "User"
  has_many :memberships, dependent: :destroy
  encrypts :meeting_url
  before_validation do
    self.latitude = (latitude * 20).round / 20.0 if latitude
    self.longitude = (longitude * 20).round / 20.0 if longitude
  end
  validates :name, presence: true, length: {maximum: 120}
  validates :kind, inclusion: {in: %w[in_person online]}
  validates :city, presence: true, if: -> { kind == "in_person" }
  validates :latitude, numericality: {in: -90..90}, allow_nil: true
  validates :longitude, numericality: {in: -180..180}, allow_nil: true
  validates :meeting_url, format: {with: /\Ahttps:\/\//}, allow_blank: true
end
