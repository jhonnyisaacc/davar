class AddNotificationDelivery < ActiveRecord::Migration[8.1]
  def change
    add_column :notifications, :delivered_at, :datetime
    add_column :notifications, :delivery_attempts, :integer, default: 0, null: false
    add_column :notifications, :delivery_error, :string
    add_index :notifications, :delivered_at
  end
end
