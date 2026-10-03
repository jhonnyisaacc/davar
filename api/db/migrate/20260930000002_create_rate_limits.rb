class CreateRateLimits < ActiveRecord::Migration[8.1]
  def change
    create_table :rate_limits do |t|
      t.string :bucket, null: false
      t.integer :attempts, null: false, default: 0
      t.datetime :expires_at, null: false
    end
    add_index :rate_limits, :bucket, unique: true
    add_index :rate_limits, :expires_at
  end
end
