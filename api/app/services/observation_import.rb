class ObservationImport
  def self.call(payload, dry_run: true)
    raise DomainError.new("unsupported_import") unless payload["schema_version"] == 1
    report = {observations: 0, confirmations: 0, dry_run: dry_run}
    NewMoonObservation.transaction do
      payload.fetch("observations").each do |row|
        observation = NewMoonObservation.find_or_initialize_by(source_id: row.fetch("id"))
        attributes = row.slice("source", "source_url", "observed_on", "country", "visibility_method", "verified")
        observation.update!(attributes.merge(input_hash: row.fetch("raw_source_hash"), provenance: row.slice("source_entry_id", "observer", "location", "observed_at", "fetched_at", "source_revision")))
        if observation.automatically_confirmable?
          confirmation = MonthConfirmation.find_or_initialize_by(new_moon_observation: observation)
          confirmation.update!(starts_on_evening: observation.observed_on)
          report[:confirmations] += 1
        elsif observation.month_confirmation
          # A changed source may retract a sighting. Preserve the observation,
          # remove invalid confirmation, and regenerate consumer dates.
          observation.month_confirmation.destroy!
        end
        report[:observations] += 1
      end
      raise ActiveRecord::Rollback if dry_run
    end
    report
  end
end
