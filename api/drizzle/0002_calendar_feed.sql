-- Calendar feed tracking for the Bun + Hono port.
-- Mirrors api/db/migrate/20261003000000_add_calendar_feed_tracking.rb
-- from PR #250. Solid Queue tables (20261003000001) are intentionally not
-- ported: jobs run as idempotent `bun run jobs:*` commands instead.

CREATE TABLE IF NOT EXISTS "calendar_feed_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'pending',
  "development_scenario" text NOT NULL DEFAULT 'pending',
  "last_attempt_at" timestamptz,
  "last_success_at" timestamptz,
  "sync_attempts" integer NOT NULL DEFAULT 0,
  "details" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "calendar_source_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL,
  "source_entry_id" text NOT NULL,
  "source_url" text NOT NULL,
  "title" text,
  "content_hash" text NOT NULL,
  "raw_content" text,
  "parse_status" text NOT NULL DEFAULT 'pending',
  "reason" text,
  "last_seen_at" timestamptz,
  "last_parsed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "calendar_source_entries_source_entry_idx" UNIQUE ("source", "source_entry_id")
);
