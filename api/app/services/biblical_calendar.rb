require "open3"
class BiblicalCalendar
  def self.call(instant:, latitude:, longitude:, timezone:, count: 1)
    lat, lon = Float(latitude), Float(longitude)
    count = Integer(count)
    raise DomainError.new("invalid_calendar_location") unless lat.between?(-90, 90) && lon.between?(-180, 180)
    raise DomainError.new("invalid_calendar_range") unless count.between?(1, 60)
    raise DomainError.new("invalid_timezone") unless TZInfo::Timezone.all_identifiers.include?(timezone)
    time = Time.iso8601(instant)
    raise DomainError.new("invalid_calendar_range") unless time.year.between?(1900, 2100)
    raise DomainError.new("instant_timezone_required") unless instant.match?(/(?:Z|[+-]\d{2}:\d{2})\z/)
    payload = {instant: time.iso8601, latitude: lat, longitude: lon, timezone: timezone, count: count,
      confirmations: MonthConfirmation.includes(:new_moon_observation).order(:starts_on_evening).map { |c|
        o = c.new_moon_observation
        {id: c.id, status: "confirmed", observed_on: o.observed_on.iso8601, starts_on_evening: c.starts_on_evening.iso8601,
          source: o.source, source_entry_id: o.source_id, source_url: o.source_url, observation_ids: [o.id],
          observers: [o.provenance["observer"]].compact, locations: [o.provenance["location"]].compact, unaided: true, ingested_at: o.created_at.iso8601, reason: "Verified INMS unaided Israel observation"}
      }}
    output, _, status = Open3.capture3(ENV.fetch("PYTHON_BIN", "python3"), Rails.root.join("lib/bore/bridge.py").to_s, stdin_data: JSON.generate(payload))
    raise DomainError.new("calendar_domain_unavailable", 503) unless status.success?
    JSON.parse(output)
  rescue ArgumentError, TypeError
    raise DomainError.new("invalid_calendar_request")
  end
end
