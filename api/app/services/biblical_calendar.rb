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
    state = CalendarFeedState.current
    scenario = DevelopmentSandbox.enabled? ? state.development_scenario : "live"
    confirmations = if scenario == "confirmed"
      NewMoonObservation.where("provenance ->> 'development_fixture' = 'true'").map do |observation|
        MonthConfirmation.new(id: observation.id, new_moon_observation: observation, starts_on_evening: observation.observed_on)
      end
    elsif scenario == "pending"
      []
    else
      MonthConfirmation.includes(:new_moon_observation).order(:starts_on_evening).reject { |c| c.new_moon_observation.provenance["development_fixture"] == true }
    end
    payload = {instant: time.iso8601, latitude: lat, longitude: lon, timezone: timezone, count: count,
      confirmations: confirmations.map { |c|
        o = c.new_moon_observation
        {id: c.id, status: "confirmed", observed_on: o.observed_on.iso8601, starts_on_evening: c.starts_on_evening.iso8601,
          source: o.source, source_entry_id: o.source_id, source_url: o.source_url, observation_ids: [o.id],
          observers: [o.provenance["observer"]].compact, locations: [o.provenance["location"]].compact, unaided: true, ingested_at: o.created_at.iso8601, reason: "Verified INMS unaided Israel observation"}
      }}
    output, _, status = Open3.capture3(ENV.fetch("PYTHON_BIN", "python3"), Rails.root.join("lib/bore/bridge.py").to_s, stdin_data: JSON.generate(payload))
    raise DomainError.new("calendar_domain_unavailable", 503) unless status.success?
    result = JSON.parse(output)
    witnesses = NewMoonObservation.where(source: CalendarFeedState::SOURCE, country: "IL", visibility_method: "unaided", verified: true)
      .where(observed_on: confirmations.map(&:starts_on_evening)).order(:source_id).to_a
    evidence = confirmations.to_h do |confirmation|
      observation = confirmation.new_moon_observation
      synthetic = observation.provenance["development_fixture"] == true
      group = witnesses.select { |o| o.observed_on == confirmation.starts_on_evening && (o.provenance["development_fixture"] == true) == synthetic }
      [confirmation.id, {observed_on: observation.observed_on.iso8601, source_url: observation.source_url,
        observers: group.filter_map { |o| o.provenance["observer"] }.uniq,
        locations: group.filter_map { |o| o.provenance["location"] }.uniq,
        unaided: true, development_fixture: synthetic}]
    end
    result["days"].each { |day| day["observation"] = evidence[day["confirmation_id"]] }
    result["generated_at"] = Time.current.iso8601
    result["source"] = scenario == "live" ? state.consumer_status : {
      name: "development_fixture", url: nil, status: "synthetic_#{scenario}",
      stale: false, review_count: 0, last_checked_at: nil, last_synced_at: nil, development_fixture: true}
    result
  rescue ArgumentError, TypeError
    raise DomainError.new("invalid_calendar_request")
  end
end
