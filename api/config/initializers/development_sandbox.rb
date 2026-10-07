if ENV["DAVAR_DEV_SANDBOX"] == "1"
  raise "DAVAR_DEV_SANDBOX is development-only" unless Rails.env.development?
  Rails.application.config.to_prepare do
    ActionMailer::Base.add_delivery_method :sandbox, DevelopmentMailboxDelivery
  end
  Rails.application.config.action_mailer.delivery_method = :sandbox
  Rails.application.config.action_mailer.raise_delivery_errors = true
end
