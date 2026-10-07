class CalendarObservationBackfill
  def self.for_entries(entries)
    data = JSON.parse(File.read(Rails.root.join("config/calendar_observation_backfill.json")))
    # The historical sheet supplements the corresponding forecast-only post.
    # Synthetic feeds and unrelated reports do not trigger a historical import.
    entries.any? { |entry| entry["source_url"] == data.fetch("report_url") } ? data.fetch("observations") : []
  end
end
