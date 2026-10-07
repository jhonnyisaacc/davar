# Davar API — Bun + Hono port (`server/`)

Byte-compatible port of the Rails 8.1 / PostgreSQL API introduced in
PR #250 (`feat/davar-v2`) to Bun + Hono. The existing Expo (`mobile/`) and
React (`web/`) clients keep calling the same `/api/v1` paths with no product
rewrites. Scripture reading, static assets and the SQLite/static-data path
are untouched — this server only owns the authenticated product domains.

Source of truth for behavior is the Rails tree in `api/` on `feat/davar-v2`
(routes, controllers, services, policies, serializers, jobs, mailer,
migrations and tests). Where this README and that tree disagree, the Rails
behavior wins.

## Run

Clients already default to `http://127.0.0.1:3000`, and so does this server:

```sh
cd server
bun install
bun run db:migrate   # needs DATABASE_URL
bun run dev          # PORT=3000 by default
```

Health: `GET /up`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes (except local dev default) | PostgreSQL connection string |
| `TEST_DATABASE_URL` | tests/CI | Separate database for `bun test` |
| `PORT` | no (`3000`) | HTTP listen port |
| `API_PUBLIC_URL` | no (`http://localhost:3000`) | OAuth callback base |
| `AUTH_RETURN_URIS` | no (`davar://auth/callback`) | Comma-separated allowlist for sign-in return URIs |
| `INVITE_GATE_ENABLED` | no (`true`) | Admission gate for assembly domains |
| `DAVAR_DEV_SANDBOX` | no | `1` enables the dev sandbox mailbox, fixture cities/AI and seed commands (development only) |
| `DAVAR_ENCRYPTION_PRIMARY_KEY` | staging/production | At-rest encryption for PII/token envelopes |
| `DAVAR_ENCRYPTION_DETERMINISTIC_KEY` | staging/production | HMAC key for deterministic identity-subject digests |
| `{GOOGLE,APPLE,TELEGRAM,FACEBOOK,X}_CLIENT_ID` + `_CLIENT_SECRET` | per provider | Env-gated OAuth availability; unconfigured providers return 503 `provider_not_configured` (email always works) |
| `MAIL_FROM` | no | Magic-link sender |
| `SMTP_HOST/PORT/USER/PASS/SECURE` | no | Real delivery; without sandbox mail is captured, not sent |
| `FREE_AI_KEY/FREE_AI_MODEL[/FREE_AI_PROVIDER]` | no | Single sponsored consultation when the user has no provider connection |
| `TELEGRAM_BOT_TOKEN` | no | Enables the Telegram notification worker |
| `PYTHON_BIN` | no (`python3`) | Interpreter for the pinned Bore bridge |
| `BORE_BRIDGE_PATH` | no (`server/lib/bore/bridge.py`) | Override for the calendar bridge |
| `IMPORT_FILE` / `APPLY` | import commands | Reviewed-payload file; dry run unless `APPLY=1` |
| `SCENARIO` | sandbox calendar | `pending` or `confirmed` |

Staging/production boot requires the encryption keys, `DATABASE_URL` and an
HTTPS `API_PUBLIC_URL`, and rejects `DAVAR_DEV_SANDBOX=1` — same as Rails.

## Database

`drizzle/0001_davar_domain.sql` mirrors the Rails domain migrations
(`20260930000001`–`20260930000005`, including notification delivery,
observation provenance and consent columns). Solid Queue is not ported.
Drizzle ORM + `postgres` (postgres.js) is the data layer; `src/db/schema.ts`
is the typed counterpart of the SQL migration.

```sh
bun run db:migrate
```

## Dev sandbox

```sh
DAVAR_DEV_SANDBOX=1 NODE_ENV=development bun run dev
```

- `GET /development/mailbox` — local HTML inbox for magic links.
- `GET /api/v1/development/status` — sandbox capabilities.
- `bun run sandbox:seed` / `bun run sandbox:reset` — synthetic accounts,
  invitation `DAVAR-LOCAL`, sandbox assemblies and article.
- `SCENARIO=confirmed bun run sandbox:reset` — synthetic INMS observation.
- Sandbox mail is written under `tmp/sandbox-mail/` and only accepts
  `@example.test` recipients.

## Jobs (idempotent, no production run in this PR)

```sh
bun run jobs:recover    # release interrupted sponsored consultations
bun run jobs:calendar   # observation sync; no-op without an explicit payload
bun run jobs:notify     # Telegram outbox delivery
bun run import:qahal / import:articles / import:observations  # IMPORT_FILE=... [APPLY=1]
```

## Tests

```sh
createdb davar_server_test
TEST_DATABASE_URL=postgresql://.../davar_server_test bun run db:migrate
bun run typecheck
bun test
```

`tests/` ports the Rails request/service assertions: authz on every route,
the handoff/PKCE/magic-link state machine, assembly decision permissions,
the single sponsored-consultation rule, calendar responses against the pinned
Bore bridge, and `tests/fixtures/contract.json`, which snapshots the JSON
shapes used by the mobile/web account, assemblies, commentary and calendar
calls. Mobile/web tests are untouched; fields they assume are preserved.

## Routes (all preserved exactly)

Health `GET /up`; dev-only mailbox/status; auth guest/providers/exchange/
session/destroy/start/callback (email, google, apple, telegram, facebook,
x); account show/update/settings/admission/notification preferences/
notifications; cities search/update; assemblies index/leaders/show/create/
update/join/leave/members/decide; endorsements; articles; conversations +
messages + memory reset; provider connections; calendar locations/today/
upcoming.

Error codes and status mapping come from Rails `DomainError`, including
`invalid_return_uri`, `provider_not_configured` (503), `invalid_email`,
`invalid_state`/`expired_or_used_link`/`invalid_handoff`/`expired_handoff`
(401). Validation failures are `validation_failed` (422); missing records
are `not_found` (404). Only digests (SHA-256 hex) are stored for state,
handoff codes and session token lookups; raw tokens, codes and verifiers are
never logged.

## Intentional gaps (no Rails source to preserve)

- `GET /api/v1/capabilities` is not in the Rails routes and no client calls
  it, so it stays absent (404) rather than invented.
- `20261003000000_add_calendar_feed_tracking.rb` / Solid Queue migrations do
  not exist in the Rails tree; the schema covers the five domain migrations.
- `assembly_discovery`, `calendar_observation_*`, `published_articles` and
  `sync_calendar_observations` services do not exist as such in Rails; the
  equivalent behavior ships as the assemblies people-fallback, the
  observation import + disabled-by-default sync job, and the published scope.
- Live OAuth/SMTP/AI providers are configuration, not code; the
  fixture/disabled paths from Rails are preserved instead.
