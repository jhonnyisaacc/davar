class ObservationImport
  def self.call(payload, dry_run: true)
    raise DomainError.new("unsupported_import") unless payload["schema_version"] == 1
    report = {observations: 0, confirmations: 0, dry_run: dry_run}
    NewMoonObservation.transaction do
      # Serialize feed/manual imports and rebuild one confirmation per month.
      NewMoonObservation.connection.execute("SELECT pg_advisory_xact_lock(1146503506)")
      incoming = payload.fetch("observations")
      payload.fetch("replace_entry_ids", []).each do |entry_id|
        retained_ids = incoming.select { |row| row["source_entry_id"] == entry_id }.map { |row| row.fetch("id") }
        NewMoonObservation.where(source: CalendarFeedState::SOURCE)
          .where("provenance ->> 'source_entry_id' = ?", entry_id)
          .where.not(source_id: retained_ids).find_each do |observation|
            observation.update!(verified: false, provenance: observation.provenance.merge("retracted_at" => Time.current.iso8601))
          end
      end
      incoming.each do |row|
        observation = NewMoonObservation.find_or_initialize_by(source_id: row.fetch("id"))
        attributes = row.slice("source", "source_url", "observed_on", "country", "visibility_method", "verified")
        provenance = observation.provenance.merge(row.slice("source_entry_id", "observer", "location", "observed_at", "fetched_at", "source_revision"))
        provenance.delete("retracted_at")
        observation.update!(attributes.merge(input_hash: row.fetch("raw_source_hash"), provenance: provenance))
        report[:observations] += 1
      end
      report[:confirmations] = rebuild_confirmations!
      raise ActiveRecord::Rollback if dry_run
    end
    report
  end

  def self.rebuild_confirmations!
    eligible = NewMoonObservation.where(source: CalendarFeedState::SOURCE, country: "IL", visibility_method: "unaided", verified: true)
      .where("COALESCE(provenance ->> 'development_fixture', 'false') != 'true'").order(:observed_on, :source_id).to_a
    # Reports can include sightings on subsequent evenings. Only their earliest
    # qualifying Israeli sighting starts a month; all witnesses remain persisted.
    representatives = eligible.group_by { |o| o.provenance["source_entry_id"].presence || o.source_id }
      .values.map(&:first).group_by(&:observed_on).transform_values(&:first)
    MonthConfirmation.where.not(starts_on_evening: representatives.keys).destroy_all
    representatives.each do |day, observation|
      confirmation = MonthConfirmation.find_or_initialize_by(starts_on_evening: day)
      confirmation.update!(new_moon_observation: observation)
    end
    representatives.length
  end
end
