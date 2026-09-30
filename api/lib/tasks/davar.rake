namespace :davar do
  desc "Release consultations interrupted by process termination"
  task recover_consultations: :environment do
    RecoverConsultationsJob.perform_now
  end
  desc "Import a reviewed decrypted Qahal export; defaults to dry run"
  task import_qahal: :environment do
    puts JSON.pretty_generate(QahalImport.call(JSON.parse(File.read(ENV.fetch("IMPORT_FILE"))), dry_run: ENV["APPLY"] != "1"))
  end
  desc "Import an explicitly permitted Shaul article manifest; defaults to dry run"
  task import_articles: :environment do
    puts JSON.pretty_generate(ArticleImport.call(JSON.parse(File.read(ENV.fetch("IMPORT_FILE"))), dry_run: ENV["APPLY"] != "1"))
  end
  desc "Import Bore observations; defaults to dry run"
  task import_observations: :environment do
    puts JSON.pretty_generate(ObservationImport.call(JSON.parse(File.read(ENV.fetch("IMPORT_FILE"))), dry_run: ENV["APPLY"] != "1"))
  end
  desc "Deliver pending Telegram notifications from the durable outbox"
  task deliver_notifications: :environment do
    TelegramNotificationsJob.perform_now
  end
  desc "Issue an operator-managed invitation code"
  task issue_invitation: :environment do
    code = SecureRandom.hex(12)
    AccessCode.create!(code_digest: AccessCode.digest(code), expires_at: 30.days.from_now, max_uses: 100)
    puts code
  end
  desc "Verify a reviewed eligible leader (operator-only command)"
  task verify_leader: :environment do
    user = User.find(ENV.fetch("USER_ID"))
    raise "Eligible male leader onboarding required" unless user.completed_onboarding? && user.profile["gender"] == "male" && user.profile["experience"] == "leader"
    user.update!(leader_verified: true)
  end
end
