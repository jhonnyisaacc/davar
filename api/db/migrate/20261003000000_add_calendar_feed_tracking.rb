class AddCalendarFeedTracking < ActiveRecord::Migration[8.1]
  def change
    create_table :calendar_feed_states, id: :uuid do |t|
      t.string :source, null: false
      t.string :status, null: false, default: "never_synced"
      t.datetime :last_attempt_at
      t.datetime :last_success_at
      t.jsonb :details, null: false, default: {}
      t.string :development_scenario, null: false, default: "live"
      t.timestamps
    end
    add_index :calendar_feed_states, :source, unique: true

    create_table :calendar_source_entries, id: :uuid do |t|
      t.string :source, null: false
      t.string :source_entry_id, null: false
      t.string :source_url, null: false
      t.string :title, null: false
      t.string :content_hash, null: false
      t.text :raw_content, null: false
      t.string :parse_status, null: false
      t.string :reason
      t.datetime :last_seen_at, null: false
      t.datetime :last_parsed_at, null: false
      t.timestamps
    end
    add_index :calendar_source_entries, [:source, :source_entry_id], unique: true
  end
end
