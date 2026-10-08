# Davar API — Bun + Hono port (`server/`)

Port of the Rails 8.1 / PostgreSQL API introduced in PR #250
(`feat/davar-v2`) to Bun + Hono. The existing Expo (`mobile/`) and React
(`web/`) clients keep calling the same `/api/v1` paths with no product
rewrites. Byte-compatible means that HTTP API only, not stored ciphertext;
see Encryption below. Scripture reading, static assets and the
SQLite/static-data path are untouched — this server only owns the
authenticated product domains.

Source of truth for behavior is the Rails tree in `api/` on `feat/davar-v2`
(routes, controllers, services, policies, serializers, jobs, mailer,
migrations and tests). Where this README and that tree disagree, the Rails
behavior wins. Stored encryption is the exception: it stays the Hono scheme
in Encryption below.

## Run

Clients already default to `http://127.0.0.1:3000`, and so does this server:

```sh
cd server
bun install
bun run db:migrate   # needs DATABASE_URL
bun run dev          # PORT=3000 by default
```

`bun run setup` installs dependencies, prepares the local
database, clears `log/*.log`, and starts the server. `--skip-server` stops
before the server. `--reset` drops and recreates that database after prepare.
`--dry-run` prints the steps and does not connect. `compose.yml` is Postgres
17 on 127.0.0.1:5432 for `davar_v2_development`. Setup does not start it.
An unset `DATABASE_URL` uses that local database. A host other than
`localhost`, `127.0.0.1`, or `::1` is refused.

Health: `GET /up`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes (except local dev default) | PostgreSQL connection string |
| `DATABASE_POOL_SIZE` | no (5) | postgres.js connection pool max |
| `TEST_DATABASE_URL` | tests/CI | Separate database for `bun test` |
| `PORT` | no (`3000`) | HTTP listen port |
| `API_PUBLIC_URL` | no (`http://localhost:3000`) | OAuth callback base |
| `AUTH_RETURN_URIS` | no (`davar://auth/callback`) | Comma-separated allowlist for sign-in return URIs |
| `INVITE_GATE_ENABLED` | no (`true`) | Admission gate for assembly domains |
| `DAVAR_DEV_SANDBOX` | no | `1` enables the dev sandbox mailbox, fixture cities/AI and seed commands (development only) |
| `DAVAR_ENCRYPTION_PRIMARY_KEY` | staging/production | At-rest encryption for PII/token envelopes |
| `DAVAR_ENCRYPTION_PREVIOUS_KEYS` | no | Comma-separated older primaries, kept only to decrypt rows written before a rotation |
| `DAVAR_ENCRYPTION_DETERMINISTIC_KEY` | staging/production | HMAC key for deterministic identity-subject digests |
| `{GOOGLE,APPLE,TELEGRAM,FACEBOOK,X}_CLIENT_ID` + `_CLIENT_SECRET` | per provider | Env-gated OAuth availability; unconfigured providers return 503 `provider_not_configured` (email always works) |
| `MAIL_FROM` | no | Magic-link sender |
| `SMTP_HOST/PORT/USER/PASS/SECURE` | no | Real delivery; without sandbox mail is captured, not sent |
| `FREE_AI_KEY/FREE_AI_MODEL[/FREE_AI_PROVIDER]` | no | Single sponsored consultation when the user has no provider connection |
| `TELEGRAM_BOT_TOKEN` | no | Enables the Telegram notification worker |
| `PYTHON_BIN` | no (`python3`) | Interpreter for the pinned Bore bridge |
| `WEB_ORIGINS` | no (Rails defaults) | Comma-separated browser origins allowed on `/api/*` |
| `TRUSTED_PROXIES` | no (loopback + private ranges) | Comma-separated IPs/IPv4 CIDRs whose `X-Forwarded-For` is honored |
| `BORE_BRIDGE_PATH` | no (`server/lib/bore/bridge.py`) | Override for the calendar bridge |
| `IMPORT_FILE` / `APPLY` | import commands | Reviewed-payload file; dry run unless `APPLY=1` |
| `SCENARIO` | sandbox calendar | `pending` or `confirmed` |

Staging/production boot requires the encryption keys, `DATABASE_URL` and an
HTTPS `API_PUBLIC_URL`, and rejects `DAVAR_DEV_SANDBOX=1`.

`bun run dev` and `bun run start` let Bun load `.env`. An exported variable
wins. The server does not pass a dotenv file list.

## Encryption

Byte-compatible means the HTTP API only: the same `/api/v1` methods, paths,
and JSON shapes. It does not mean stored bytes. Ciphertext is not
compatible with the older encryption, and this server does not
try to make it so. No Rails-written data needs to be preserved (Jhonny,
2026-10-07; `docs/decisions/0001-keep-hono-encryption-key-version.md`).
Local databases can be reset. `ACTIVE_RECORD_ENCRYPTION_*` is not read,
and there is no key-derivation salt.

The scheme is AES-256-GCM. The AES key is `SHA-256(secret)`. Identities
are looked up by an HMAC digest (`subject_digest`), not by deterministic
ciphertext.

New writes use a versioned envelope:

```
v1.<keyId>.<payload>
```

- `v1` names this Hono scheme.
- `keyId` is the first 8 hex characters (4 bytes) of `SHA-256(secret)`,
  lowercase. New rows stamp the current `DAVAR_ENCRYPTION_PRIMARY_KEY`.
- `payload` is base64url (no padding) of a random 12-byte IV followed by
  the AES-GCM ciphertext and tag.

Reads try `[DAVAR_ENCRYPTION_PRIMARY_KEY, ...DAVAR_ENCRYPTION_PREVIOUS_KEYS]`
in that order (`decryptionKeys`). A versioned envelope opens only with the
secret whose key id matches, so a later primary can be introduced and an
older envelope still opens while its secret stays on the previous-key list.
Envelopes written before key ids (`v1.<payload>`, no key id) still decrypt
with the current primary key. After that primary is moved onto the
previous-key list, those same envelopes open from that list.

To rotate, generate a new primary, move the old one into
`DAVAR_ENCRYPTION_PREVIOUS_KEYS`, and drop it once rows have been rewritten
under the new key. Rotating `DAVAR_ENCRYPTION_DETERMINISTIC_KEY` changes
identity digests and is not seamless (lookups would miss).

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
- `bun run sandbox:calendar [live|pending|confirmed]` — sets the calendar scenario. The default is `live`, which then runs the calendar sync.
- `SCENARIO=confirmed bun run sandbox:reset` — synthetic INMS observation.
- Sandbox mail is written under `tmp/sandbox-mail/` and only accepts
  `@example.test` recipients.

## Jobs (idempotent, no production run in this PR)

```sh
bun run jobs:recover    # release interrupted sponsored consultations
bun run jobs:calendar   # observation sync; no-op without an explicit payload
bun run jobs:notify     # Telegram outbox delivery
bun run import:qahal / import:articles / import:observations  # IMPORT_FILE=... [APPLY=1]
bun run operator:issue-invitation   # print a 7-digit code, 30 days, 100 uses
bun run operator:verify-leader      # USER_ID=... sets leader_verified for an eligible leader
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

Health `GET /up`; public `GET /api/v1/capabilities`; dev-only
mailbox/status; auth guest/providers/exchange/session/destroy/start/
callback (email, google, apple, telegram, facebook, x); account
show/update/settings/admission/notification preferences/notifications;
cities search/update; assemblies index/leaders/show/create/update/join/
leave/members/decide; endorsements; articles; conversations + messages +
memory reset; provider connections; calendar locations/today/upcoming.

Error codes and status mapping come from Rails `DomainError`, including
`invalid_return_uri`, `provider_not_configured` (503), `invalid_email`,
`invalid_state`/`expired_or_used_link`/`invalid_handoff`/`expired_handoff`
(401). Validation failures are `validation_failed` (422); missing records
are `not_found` (404). Only digests (SHA-256 hex) are stored for state,
handoff codes and session token lookups; raw tokens, codes and verifiers are
never logged.

## Intentional gaps (verified against the tip of `feat/davar-v2`)

- `20261003000001_add_solid_queue.rb` is not ported: there is no ActiveJob
  backend here. Jobs ship as idempotent `bun run jobs:*` commands
  (recover, calendar sync, Telegram delivery); nothing enqueues at runtime.
  `20261003000000_add_calendar_feed_tracking.rb` **is** ported
  (`drizzle/0002_calendar_feed.sql`).
- Stored ciphertext uses this server's envelope (see
  Encryption above). Byte-compatible means the HTTP API only, not stored
  bytes.
- JWKS rotation recovers faster than Rails: an unknown `kid` refetches
  after a 30s cooldown instead of waiting out Rails' hourly cache. The
  `algorithms: ["RS256"]` pin matches Rails exactly.
- `resolveAccount` retries a lost insert-or-find race at most 3 times;
  Rails retries indefinitely. The retry runs behind a savepoint either way.
- `AUTH_RETURN_URIS` entries are trimmed and empties dropped; Rails
  compares untrimmed (a sloppy env value works here that Rails rejects).
- Query-string `notification_consent=true` no longer opts in (Rails'
  `== true` ignores it); only a JSON boolean does.
- `server/lib/bore/` is a byte-identical consumer copy of `api/lib/bore`
  (plus this repo's `README.davar.md`); `api/` is canonical. CI's
  `bore-parity` job diffs the two trees.
- Live OAuth/SMTP/AI providers are configuration, not code; the
  fixture/disabled paths from Rails are preserved instead.

Rules the code follows (all learned from bugs above): no external I/O
inside DB transactions (provider lookup runs before the callback
transaction; statement retries go through `withSavepoint`); never log
error messages or query params (logs carry name, pg code, method, route);
client IPs come from the socket with a trusted-proxy XFF walk, never from
blindly trusted headers.
