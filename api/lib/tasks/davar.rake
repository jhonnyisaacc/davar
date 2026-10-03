namespace :davar do
  desc "Synchronize public INMS reports using the same ingestion in every environment"
  task sync_calendar: :environment do
    puts JSON.generate(SyncCalendarObservationsJob.perform_now)
  end
  desc "Keep calendar observations current; run as a supervised process"
  task watch_calendar: :environment do
    loop do
      begin
        puts JSON.generate(SyncCalendarObservationsJob.perform_now)
      rescue StandardError => error
        warn "Calendar synchronization failed (#{error.class.name})"
      end
      $stdout.flush
      sleep 15.minutes
    end
  end
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
    code = SecureRandom.alphanumeric(7).upcase
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
namespace :davar do
  namespace :sandbox do
    task seed: :environment do
      puts JSON.pretty_generate(DevelopmentFixtures.seed!)
    end
    task reset: :environment do
      puts JSON.pretty_generate(DevelopmentFixtures.reset!)
    end
    task calendar: :environment do
      puts JSON.pretty_generate(DevelopmentFixtures.calendar!(ENV.fetch("SCENARIO", "pending")))
    end
  end
end
