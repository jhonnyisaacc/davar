-- Davar v2 domain schema for the Bun + Hono port.
-- Mirrors api/db/migrate/20260930000001_create_davar_domain.rb,
-- 20260930000002_create_rate_limits.rb,
-- 20260930000003_add_notification_delivery.rb,
-- 20260930000004_preserve_observation_provenance.rb and
-- 20260930000005_record_notification_consent.rb from PR #250.
-- Solid Queue tables are intentionally not ported.
-- Application-level encryption envelopes are opaque text here; the
-- subject_digest column backs the deterministic identity lookup.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "display_name" text,
  "profile" text,
  "settings" jsonb NOT NULL DEFAULT '{}',
  "settings_version" integer NOT NULL DEFAULT 0,
  "discoverable" boolean NOT NULL DEFAULT false,
  "contact_visible" boolean NOT NULL DEFAULT false,
  "leader_verified" boolean NOT NULL DEFAULT false,
  "admitted_at" timestamptz,
  "free_consultations" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "subject" text NOT NULL,
  "subject_digest" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "identities_provider_subject_idx" UNIQUE ("provider", "subject_digest")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "token_digest" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "auth_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "state_digest" text NOT NULL UNIQUE,
  "nonce" text,
  "verifier" text,
  "return_uri" text NOT NULL,
  "user_id" uuid REFERENCES "users" ("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "email" text,
  "notification_consent_requested" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "handoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "sessions" ("id") ON DELETE CASCADE,
  "code_digest" text NOT NULL UNIQUE,
  "token" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "access_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_digest" text NOT NULL UNIQUE,
  "max_uses" integer NOT NULL DEFAULT 100,
  "uses" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "assemblies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "leader_id" uuid NOT NULL UNIQUE REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "city" text,
  "latitude" numeric(5, 2),
  "longitude" numeric(6, 2),
  "meeting_url" text,
  "source_id" text UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "assembly_kind" CHECK (kind IN ('in_person', 'online')),
  CONSTRAINT "assembly_latitude" CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT "assembly_longitude" CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "assembly_id" uuid NOT NULL REFERENCES "assemblies" ("id") ON DELETE CASCADE,
  "state" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "membership_state" CHECK (state IN ('requested', 'member', 'declined', 'left')),
  CONSTRAINT "memberships_user_assembly_idx" UNIQUE ("user_id", "assembly_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_membership" ON "memberships" ("user_id") WHERE state = 'member';

CREATE TABLE IF NOT EXISTS "endorsements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "applicant_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "leader_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "state" text NOT NULL DEFAULT 'requested',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "endorsements_applicant_leader_idx" UNIQUE ("applicant_id", "leader_id")
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}',
  "read_at" timestamptz,
  "delivered_at" timestamptz,
  "delivery_attempts" integer NOT NULL DEFAULT 0,
  "delivery_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "notifications_delivered_at_idx" ON "notifications" ("delivered_at");

CREATE TABLE IF NOT EXISTS "articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_id" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "locale" text NOT NULL,
  "body" text,
  "source_url" text NOT NULL,
  "attribution" text NOT NULL,
  "revision" text NOT NULL,
  "input_hash" text NOT NULL,
  "publication_state" text NOT NULL DEFAULT 'draft',
  "references" jsonb NOT NULL DEFAULT '[]',
  "permissions" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "title" text,
  "memory" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations" ("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "context" text,
  "citations" text,
  "generation" jsonb NOT NULL DEFAULT '{}',
  "request_id" text,
  "state" text NOT NULL DEFAULT 'complete',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversation_request_idx" ON "messages" ("conversation_id", "request_id") WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS "provider_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "credential" text NOT NULL,
  "model" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "provider_connections_user_provider_idx" UNIQUE ("user_id", "provider")
);

CREATE TABLE IF NOT EXISTS "new_moon_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_id" text NOT NULL UNIQUE,
  "source" text NOT NULL,
  "source_url" text NOT NULL,
  "input_hash" text NOT NULL,
  "observed_on" date NOT NULL,
  "country" text NOT NULL,
  "visibility_method" text NOT NULL,
  "verified" boolean NOT NULL DEFAULT false,
  "provenance" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "month_confirmations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "new_moon_observation_id" uuid NOT NULL REFERENCES "new_moon_observations" ("id") ON DELETE CASCADE,
  "starts_on_evening" date NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "bucket" text NOT NULL UNIQUE,
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "rate_limits_expires_at_idx" ON "rate_limits" ("expires_at");
