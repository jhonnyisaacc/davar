class MonthConfirmation < ApplicationRecord
  belongs_to :new_moon_observation
  validate do
    errors.add(:new_moon_observation, "requires verified unaided INMS evidence from Israel") unless new_moon_observation&.automatically_confirmable?
    errors.add(:starts_on_evening, "must match observation") unless starts_on_evening == new_moon_observation&.observed_on
  end
end
