class CalendarFeedState < ApplicationRecord
  SOURCE = "israeli_new_moon_society"
  URL = "https://moonsocil.blogspot.com/"
  validates :source, presence: true, uniqueness: true
  validates :development_scenario, inclusion: {in: %w[live pending confirmed]}

  def self.current
    find_or_create_by!(source: SOURCE)
  rescue ActiveRecord::RecordNotUnique
    find_by!(source: SOURCE)
  end

  def consumer_status(now: Time.current)
    {name: SOURCE, url: URL, status: status, last_checked_at: last_attempt_at&.iso8601,
      last_synced_at: last_success_at&.iso8601,
      stale: last_success_at.nil? || status == "source_unavailable" ||
        (last_success_at < now - 2.hours && CalendarObservationWindow.open?(now: now)),
      review_count: details.fetch("review_count", 0), development_fixture: false}
  end
end
