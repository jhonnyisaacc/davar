require "open3"

class CalendarObservationWindow
  def self.open?(now: Time.current)
    start = MonthConfirmation.joins(:new_moon_observation)
      .where("COALESCE(new_moon_observations.provenance ->> 'development_fixture', 'false') != 'true'")
      .where(starts_on_evening: ..now.in_time_zone("Asia/Jerusalem").to_date)
      .maximum(:starts_on_evening)
    return true unless start # Bootstrap a calendar without any imported sightings.

    output, _, status = Open3.capture3(ENV.fetch("PYTHON_BIN", "python3"), Rails.root.join("lib/bore/observation_window.py").to_s,
      stdin_data: JSON.generate(starts_on_evening: start.iso8601))
    raise DomainError.new("calendar_domain_unavailable", 503) unless status.success?
    now >= Time.iso8601(JSON.parse(output).fetch("opens_at"))
  end
end
