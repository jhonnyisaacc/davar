class QahalImport
  # Only an operator-reviewed decrypted export is accepted. Never copy ciphertext
  # into Rails or infer identities from names. No source files are modified.
  def self.call(payload, dry_run: true)
    raise DomainError.new("unsupported_import") unless payload["schema_version"] == 1 && payload["source_revision"].present?
    raise DomainError.new("decrypted_export_required") unless payload["decrypted"] == true
    report = {source_revision: payload["source_revision"], dry_run: dry_run, users: 0, assemblies: 0, memberships: 0, mappings: {}}
    User.transaction do
      payload.fetch("users").each do |row|
        raise DomainError.new("invalid_telegram_identity") unless row["telegram_id"].is_a?(Integer) && row["telegram_id"] > 0
        user = Accounts.resolve!(provider: "telegram", subject: row["telegram_id"].to_s)
        # Imports do not silently grant leader capabilities or admission.
        user.update!(display_name: row.fetch("display_name"), profile: row.fetch("profile"),
          discoverable: row["discoverable"] == true, contact_visible: row["contact_visible"] == true)
        report[:mappings][row["telegram_id"].to_s] = user.id
        report[:users] += 1
      end
      payload.fetch("assemblies").each do |row|
        leader = Identity.find_by!(provider: "telegram", subject: row.fetch("leader_telegram_id").to_s).user
        assembly = Assembly.find_or_initialize_by(source_id: "qahal:#{row.fetch("id")}")
        assembly.update!(leader: leader, name: row.fetch("name"), kind: row.fetch("kind"),
          city: row["city"], latitude: row["latitude"], longitude: row["longitude"], meeting_url: row["meeting_url"])
        report[:assemblies] += 1
      end
      payload.fetch("memberships").each do |row|
        user = Identity.find_by!(provider: "telegram", subject: row.fetch("telegram_id").to_s).user
        assembly = Assembly.find_by!(source_id: "qahal:#{row.fetch("assembly_id")}")
        membership = Membership.find_or_initialize_by(user: user, assembly: assembly)
        membership.update!(state: row.fetch("state"))
        report[:memberships] += 1
      end
      raise ActiveRecord::Rollback if dry_run
    end
    report
  end
end
