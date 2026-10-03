# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_03_000000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"

  create_table "access_codes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "code_digest", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.integer "max_uses", default: 100, null: false
    t.datetime "revoked_at"
    t.datetime "updated_at", null: false
    t.integer "uses", default: 0, null: false
    t.index ["code_digest"], name: "index_access_codes_on_code_digest", unique: true
  end

  create_table "articles", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "attribution", null: false
    t.text "body"
    t.datetime "created_at", null: false
    t.string "input_hash", null: false
    t.string "locale", null: false
    t.jsonb "permissions", default: {}, null: false
    t.string "publication_state", default: "draft", null: false
    t.jsonb "references", default: [], null: false
    t.string "revision", null: false
    t.string "source_id", null: false
    t.string "source_url", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["source_id"], name: "index_articles_on_source_id", unique: true
  end

  create_table "assemblies", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "city"
    t.datetime "created_at", null: false
    t.string "kind", null: false
    t.decimal "latitude", precision: 5, scale: 2
    t.uuid "leader_id", null: false
    t.decimal "longitude", precision: 6, scale: 2
    t.text "meeting_url"
    t.string "name", null: false
    t.string "source_id"
    t.datetime "updated_at", null: false
    t.index ["leader_id"], name: "index_assemblies_on_leader_id", unique: true
    t.index ["source_id"], name: "index_assemblies_on_source_id", unique: true
    t.check_constraint "kind::text = ANY (ARRAY['in_person'::character varying::text, 'online'::character varying::text])", name: "assembly_kind"
  end

  create_table "auth_attempts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "consumed_at"
    t.datetime "created_at", null: false
    t.text "email"
    t.datetime "expires_at", null: false
    t.string "nonce"
    t.boolean "notification_consent_requested", default: false, null: false
    t.string "provider", null: false
    t.string "return_uri", null: false
    t.string "state_digest", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id"
    t.text "verifier"
    t.index ["state_digest"], name: "index_auth_attempts_on_state_digest", unique: true
    t.index ["user_id"], name: "index_auth_attempts_on_user_id"
  end

  create_table "calendar_feed_states", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.jsonb "details", default: {}, null: false
    t.string "development_scenario", default: "live", null: false
    t.datetime "last_attempt_at"
    t.datetime "last_success_at"
    t.string "source", null: false
    t.string "status", default: "never_synced", null: false
    t.datetime "updated_at", null: false
    t.index ["source"], name: "index_calendar_feed_states_on_source", unique: true
  end

  create_table "calendar_source_entries", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "content_hash", null: false
    t.datetime "created_at", null: false
    t.datetime "last_parsed_at", null: false
    t.datetime "last_seen_at", null: false
    t.string "parse_status", null: false
    t.text "raw_content", null: false
    t.string "reason"
    t.string "source", null: false
    t.string "source_entry_id", null: false
    t.string "source_url", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["source", "source_entry_id"], name: "index_calendar_source_entries_on_source_and_source_entry_id", unique: true
  end

  create_table "conversations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "memory"
    t.text "title"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["user_id"], name: "index_conversations_on_user_id"
  end

  create_table "endorsements", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "applicant_id", null: false
    t.datetime "created_at", null: false
    t.uuid "leader_id", null: false
    t.string "state", default: "requested", null: false
    t.datetime "updated_at", null: false
    t.index ["applicant_id", "leader_id"], name: "index_endorsements_on_applicant_id_and_leader_id", unique: true
    t.index ["applicant_id"], name: "index_endorsements_on_applicant_id"
    t.index ["leader_id"], name: "index_endorsements_on_leader_id"
  end

  create_table "handoffs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "code_digest", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.uuid "session_id", null: false
    t.text "token", null: false
    t.datetime "updated_at", null: false
    t.index ["code_digest"], name: "index_handoffs_on_code_digest", unique: true
    t.index ["session_id"], name: "index_handoffs_on_session_id"
  end

  create_table "identities", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "provider", null: false
    t.text "subject", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["provider", "subject"], name: "index_identities_on_provider_and_subject", unique: true
    t.index ["user_id"], name: "index_identities_on_user_id"
  end

  create_table "memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "assembly_id", null: false
    t.datetime "created_at", null: false
    t.string "state", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["assembly_id"], name: "index_memberships_on_assembly_id"
    t.index ["user_id", "assembly_id"], name: "index_memberships_on_user_id_and_assembly_id", unique: true
    t.index ["user_id"], name: "index_memberships_on_user_id"
    t.index ["user_id"], name: "one_active_membership", unique: true, where: "((state)::text = 'member'::text)"
    t.check_constraint "state::text = ANY (ARRAY['requested'::character varying::text, 'member'::character varying::text, 'declined'::character varying::text, 'left'::character varying::text])", name: "membership_state"
  end

  create_table "messages", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "citations"
    t.text "content", null: false
    t.text "context"
    t.uuid "conversation_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "generation", default: {}, null: false
    t.string "request_id"
    t.string "role", null: false
    t.string "state", default: "complete", null: false
    t.datetime "updated_at", null: false
    t.index ["conversation_id", "request_id"], name: "index_messages_on_conversation_id_and_request_id", unique: true, where: "(request_id IS NOT NULL)"
    t.index ["conversation_id"], name: "index_messages_on_conversation_id"
  end

  create_table "month_confirmations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "new_moon_observation_id", null: false
    t.date "starts_on_evening", null: false
    t.datetime "updated_at", null: false
    t.index ["new_moon_observation_id"], name: "index_month_confirmations_on_new_moon_observation_id"
    t.index ["starts_on_evening"], name: "index_month_confirmations_on_starts_on_evening", unique: true
  end

  create_table "new_moon_observations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "country", null: false
    t.datetime "created_at", null: false
    t.string "input_hash", null: false
    t.date "observed_on", null: false
    t.jsonb "provenance", default: {}, null: false
    t.string "source", null: false
    t.string "source_id", null: false
    t.string "source_url", null: false
    t.datetime "updated_at", null: false
    t.boolean "verified", default: false, null: false
    t.string "visibility_method", null: false
    t.index ["source_id"], name: "index_new_moon_observations_on_source_id", unique: true
  end

  create_table "notifications", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.jsonb "data", default: {}, null: false
    t.datetime "delivered_at"
    t.integer "delivery_attempts", default: 0, null: false
    t.string "delivery_error"
    t.string "kind", null: false
    t.datetime "read_at"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["delivered_at"], name: "index_notifications_on_delivered_at"
    t.index ["user_id"], name: "index_notifications_on_user_id"
  end

  create_table "provider_connections", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "credential", null: false
    t.string "model", null: false
    t.string "provider", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["user_id", "provider"], name: "index_provider_connections_on_user_id_and_provider", unique: true
    t.index ["user_id"], name: "index_provider_connections_on_user_id"
  end

  create_table "rate_limits", force: :cascade do |t|
    t.integer "attempts", default: 0, null: false
    t.string "bucket", null: false
    t.datetime "expires_at", null: false
    t.index ["bucket"], name: "index_rate_limits_on_bucket", unique: true
    t.index ["expires_at"], name: "index_rate_limits_on_expires_at"
  end

  create_table "sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.datetime "revoked_at"
    t.string "token_digest", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["token_digest"], name: "index_sessions_on_token_digest", unique: true
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "admitted_at"
    t.boolean "contact_visible", default: false, null: false
    t.datetime "created_at", null: false
    t.boolean "discoverable", default: false, null: false
    t.text "display_name"
    t.integer "free_consultations", default: 0, null: false
    t.boolean "leader_verified", default: false, null: false
    t.text "profile"
    t.jsonb "settings", default: {}, null: false
    t.integer "settings_version", default: 0, null: false
    t.datetime "updated_at", null: false
  end

  add_foreign_key "assemblies", "users", column: "leader_id"
  add_foreign_key "auth_attempts", "users"
  add_foreign_key "conversations", "users"
  add_foreign_key "endorsements", "users", column: "applicant_id"
  add_foreign_key "endorsements", "users", column: "leader_id"
  add_foreign_key "handoffs", "sessions"
  add_foreign_key "identities", "users"
  add_foreign_key "memberships", "assemblies"
  add_foreign_key "memberships", "users"
  add_foreign_key "messages", "conversations"
  add_foreign_key "month_confirmations", "new_moon_observations"
  add_foreign_key "notifications", "users"
  add_foreign_key "provider_connections", "users"
  add_foreign_key "sessions", "users"
end
