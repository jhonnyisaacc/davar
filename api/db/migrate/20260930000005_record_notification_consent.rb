class RecordNotificationConsent < ActiveRecord::Migration[8.1]
  def change
    add_column :auth_attempts, :notification_consent_requested, :boolean, null: false, default: false
  end
end
