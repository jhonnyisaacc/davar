class NewMoonObservation < ApplicationRecord
  has_one :month_confirmation, dependent: :destroy
  validates :source_id, :source_url, :input_hash, :observed_on, presence: true
  def automatically_confirmable?
    source == "israeli_new_moon_society" && country == "IL" && visibility_method == "unaided" && verified
  end
end
