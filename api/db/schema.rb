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

ActiveRecord::Schema[8.1].define(version: 2026_10_03_000001) do
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

  create_table "solid_queue_batch_executions", force: :cascade do |t|
    t.bigint "batch_id", null: false
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.index ["batch_id"], name: "index_solid_queue_batch_executions_on_batch_id"
    t.index ["job_id"], name: "index_solid_queue_batch_executions_on_job_id", unique: true
  end

  create_table "solid_queue_batches", force: :cascade do |t|
    t.string "active_job_batch_id"
    t.integer "completed_jobs", default: 0, null: false
    t.datetime "created_at", null: false
    t.string "description"
    t.datetime "enqueued_at"
    t.datetime "failed_at"
    t.integer "failed_jobs", default: 0, null: false
    t.datetime "finished_at"
    t.text "metadata"
    t.text "on_failure"
    t.text "on_finish"
    t.text "on_success"
    t.integer "total_jobs", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["active_job_batch_id"], name: "index_solid_queue_batches_on_active_job_batch_id", unique: true
    t.index ["finished_at"], name: "index_solid_queue_batches_on_finished_at"
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.string "concurrency_key", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "error"
    t.bigint "job_id", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "active_job_id"
    t.text "arguments"
    t.bigint "batch_id"
    t.string "class_name", null: false
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "finished_at"
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at"
    t.datetime "updated_at", null: false
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["batch_id"], name: "index_solid_queue_jobs_on_batch_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "queue_name", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "hostname"
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.text "metadata"
    t.string "name", null: false
    t.integer "pid", null: false
    t.bigint "supervisor_id"
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.datetime "run_at", null: false
    t.string "task_key", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.text "arguments"
    t.string "class_name"
    t.string "command", limit: 2048
    t.datetime "created_at", null: false
    t.text "description"
    t.string "key", null: false
    t.integer "priority", default: 0
    t.string "queue_name"
    t.string "schedule", null: false
    t.boolean "static", default: true, null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.integer "value", default: 1, null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
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
  add_foreign_key "solid_queue_batch_executions", "solid_queue_batches", column: "batch_id", on_delete: :cascade
  add_foreign_key "solid_queue_batch_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
end
