class CreateDavarDomain < ActiveRecord::Migration[8.1]
  def change
    enable_extension "pgcrypto" unless extension_enabled?("pgcrypto")
    create_table :users, id: :uuid do |t|
      t.text :display_name
      t.text :profile
      t.jsonb :settings, null: false, default: {}
      t.integer :settings_version, null: false, default: 0
      t.boolean :discoverable, null: false, default: false
      t.boolean :contact_visible, null: false, default: false
      t.boolean :leader_verified, null: false, default: false
      t.datetime :admitted_at
      t.integer :free_consultations, null: false, default: 0
      t.timestamps
    end
    create_table :identities, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.string :provider, null: false
      t.text :subject, null: false
      t.timestamps
    end
    add_index :identities, [:provider, :subject], unique: true
    create_table :sessions, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.string :token_digest, null: false
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :sessions, :token_digest, unique: true
    create_table :auth_attempts, id: :uuid do |t|
      t.string :provider, null: false
      t.string :state_digest, null: false
      t.string :nonce
      t.text :verifier
      t.string :return_uri, null: false
      t.references :user, type: :uuid, foreign_key: true
      t.datetime :expires_at, null: false
      t.datetime :consumed_at
      t.text :email
      t.timestamps
    end
    add_index :auth_attempts, :state_digest, unique: true
    create_table :handoffs, id: :uuid do |t|
      t.references :session, type: :uuid, null: false, foreign_key: true
      t.string :code_digest, null: false
      t.text :token, null: false
      t.datetime :expires_at, null: false
      t.timestamps
    end
    add_index :handoffs, :code_digest, unique: true
    create_table :access_codes, id: :uuid do |t|
      t.string :code_digest, null: false
      t.integer :max_uses, null: false, default: 100
      t.integer :uses, null: false, default: 0
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :access_codes, :code_digest, unique: true
    create_table :assemblies, id: :uuid do |t|
      t.references :leader, type: :uuid, null: false, index: {unique: true}, foreign_key: {to_table: :users}
      t.string :name, null: false
      t.string :kind, null: false
      t.string :city
      t.decimal :latitude, precision: 5, scale: 2
      t.decimal :longitude, precision: 6, scale: 2
      t.text :meeting_url
      t.string :source_id
      t.timestamps
    end
    add_index :assemblies, :source_id, unique: true
    add_check_constraint :assemblies, "kind IN ('in_person', 'online')", name: "assembly_kind"
    create_table :memberships, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.references :assembly, type: :uuid, null: false, foreign_key: true
      t.string :state, null: false
      t.timestamps
    end
    add_index :memberships, [:user_id, :assembly_id], unique: true
    add_index :memberships, :user_id, unique: true, where: "state = 'member'", name: "one_active_membership"
    add_check_constraint :memberships, "state IN ('requested', 'member', 'declined', 'left')", name: "membership_state"
    create_table :endorsements, id: :uuid do |t|
      t.references :applicant, type: :uuid, null: false, foreign_key: {to_table: :users}
      t.references :leader, type: :uuid, null: false, foreign_key: {to_table: :users}
      t.string :state, null: false, default: "requested"
      t.timestamps
    end
    add_index :endorsements, [:applicant_id, :leader_id], unique: true
    create_table :notifications, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.jsonb :data, null: false, default: {}
      t.datetime :read_at
      t.timestamps
    end
    create_table :articles, id: :uuid do |t|
      t.string :source_id, null: false
      t.string :title, null: false
      t.string :locale, null: false
      t.text :body
      t.string :source_url, null: false
      t.string :attribution, null: false
      t.string :revision, null: false
      t.string :input_hash, null: false
      t.string :publication_state, null: false, default: "draft"
      t.jsonb :references, null: false, default: []
      t.jsonb :permissions, null: false, default: {}
      t.timestamps
    end
    add_index :articles, :source_id, unique: true
    create_table :conversations, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.text :title
      t.text :memory
      t.timestamps
    end
    create_table :messages, id: :uuid do |t|
      t.references :conversation, type: :uuid, null: false, foreign_key: true
      t.string :role, null: false
      t.text :content, null: false
      t.text :context
      t.text :citations
      t.jsonb :generation, null: false, default: {}
      t.string :request_id
      t.string :state, null: false, default: "complete"
      t.timestamps
    end
    add_index :messages, [:conversation_id, :request_id], unique: true, where: "request_id IS NOT NULL"
    create_table :provider_connections, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.string :provider, null: false
      t.text :credential, null: false
      t.string :model, null: false
      t.timestamps
    end
    add_index :provider_connections, [:user_id, :provider], unique: true
    create_table :new_moon_observations, id: :uuid do |t|
      t.string :source_id, null: false
      t.string :source, null: false
      t.string :source_url, null: false
      t.string :input_hash, null: false
      t.date :observed_on, null: false
      t.string :country, null: false
      t.string :visibility_method, null: false
      t.boolean :verified, null: false, default: false
      t.timestamps
    end
    add_index :new_moon_observations, :source_id, unique: true
    create_table :month_confirmations, id: :uuid do |t|
      t.references :new_moon_observation, type: :uuid, null: false, foreign_key: true
      t.date :starts_on_evening, null: false
      t.timestamps
    end
    add_index :month_confirmations, :starts_on_evening, unique: true
  end
end
