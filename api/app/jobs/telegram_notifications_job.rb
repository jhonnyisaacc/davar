class TelegramNotificationsJob < ApplicationJob
  def perform
    return if DevelopmentSandbox.enabled?
    return if ENV["TELEGRAM_BOT_TOKEN"].blank?
    Notification.where(delivered_at: nil).where("delivery_attempts < 5").includes(user: :identities).find_each do |notification|
      notification.with_lock do
        next if notification.delivered_at
        telegram = notification.user.identities.find { |identity| identity.provider == "telegram" }
        next unless telegram && notification.user.settings["telegram_notifications"] == true
        notification.increment!(:delivery_attempts)
        begin
          # Generic event text avoids sending profile or conversation details externally.
          ProviderHttp.json("https://api.telegram.org/bot#{ENV.fetch("TELEGRAM_BOT_TOKEN")}/sendMessage", method: :post,
            body: {chat_id: telegram.subject, text: "Davar: #{notification.kind.tr("_", " ")}. Open Assemblies to review."})
          notification.update!(delivered_at: Time.current, delivery_error: nil)
        rescue DomainError => error
          notification.update!(delivery_error: error.code)
        end
      end
    end
  end
end
