# Davar API

Rails 8.1, Ruby 3.4.9, PostgreSQL, and Python 3.13. Rails owns user/domain
persistence; immutable Scripture remains in existing static delivery and SQLite.
Bore is adopted behind an isolated server-side Python boundary, pinned in
lib/bore/UPSTREAM.md. No client calculates Biblical dates.

## Local development

From api/:
- `bundle install`
- `python3 -m pip install -r requirements.txt`
- Start PostgreSQL directly or `docker compose up -d`.
- `bundle exec rails db:prepare`
- `bundle exec rails server -b 0.0.0.0 -p 3000`
- `bundle exec rails test`
- `bundle exec rails zeitwerk:check`

compose.yml uses local-only credentials. Set PGUSER=davar and
PGPASSWORD=local-development-only when using that container. Never use those
credentials for a hosted database. No production migration has been run.

From mobile/: `EXPO_PUBLIC_API_URL=http://YOUR_LAN_HOST:3000 bun run start`.
From web/: `PUBLIC_API_URL=http://localhost:3000 bun run dev`.
JavaScript commands run with Bun in the relevant surface directory.

## Development, staging and production

Rails has distinct `development`, `staging`, and `production` environments,
plus `test` for automated checks. Staging loads production runtime settings:
HTTPS is required, code is eagerly loaded, reloading is disabled, detailed error
pages are hidden, and logs go to stdout. Only configuration and data differ.

| Environment | Database | Configuration example |
| --- | --- | --- |
| Development | davar_v2_development | .env.development.example |
| Staging | davar_v2_staging via its own DATABASE_URL | .env.staging.example |
| Production | davar_v2_production via its own DATABASE_URL | .env.production.example |

Examples contain no credentials and are not automatically loaded by Rails. Inject
them through your local environment manager or host secret manager. From api/,
start with `RAILS_ENV=development bundle exec rails server`,
`RAILS_ENV=staging bundle exec rails server`, or
`RAILS_ENV=production bundle exec rails server` after configuring the environment.
Run migrations with the same explicit RAILS_ENV and its database credentials.

Provision separate staging and production databases and database users, encryption
keys, SECRET_KEY_BASE, OAuth apps/callbacks, allowed hosts/origins, SMTP and AI/bot
credentials. Never point staging at production or copy production personal data
into staging. Use fixtures or approved anonymized data and sandbox integrations.
Staging and production fail at boot if database/security/domain configuration is
missing; neither falls back to the development encryption keys. Native return
allowlists must match the configured application build; a staging native build may
require its own scheme/provider app configuration before live callback validation.

This PR configures and tests these environments; hosted resources have not been
provisioned or deployed.

## Authentication

Register each provider's HTTPS callback:
`API_PUBLIC_URL/api/v1/auth/PROVIDER/callback`. Apple uses form_post; other
providers return authorization codes with state. Codes are exchanged by Rails.
Google/Apple/Telegram ID tokens validate signature, issuer, audience, expiry and
nonce. Telegram OIDC's legacy `id` claim is used to retain Qahal identity; OIDC
`sub` is a different identifier. Bot notifications require a separate linked
Telegram authorization with the `telegram:bot_access` scope; ordinary sign-in does
not opt users in. The account can revoke that preference at any time. See
[Telegram login documentation](https://core.telegram.org/bots/telegram-login).

The native return is davar://auth/callback. Web return URLs must be explicitly
listed in AUTH_RETURN_URIS. Access credentials are never placed in redirect URLs:
a one-minute, single-use handoff is redeemed through POST /auth/exchange.
Linking requires a current authenticated user and fresh provider proof. Matching
email alone never merges accounts. Email links expire after ten minutes.

See .env.example for configuration names. OAuth apps, SMTP, production encryption
keys and sponsored AI access must be configured externally. Provider credentials
are not interchangeable with consumer AI subscriptions. Muse remains unavailable
until its actual provider/authentication contract is established.

Expo SecureStore changes runtimeVersion to 1.0.2. A future release requires
eas build then eas submit, not an OTA update against the previous runtime.
Do not run publication commands for this PR.

## Domain APIs

All routes are under /api/v1. Private responses use no-store.
- Public: auth/providers, provider start/callback/exchange, articles, calendar.
- Account: GET/PATCH /account; PATCH /account/settings with settings + version;
  POST /account/admission; GET /account/notifications.
- Cities: GET /cities?q=; PATCH /account/city with a server-signed selection.
- Assemblies: list/detail/create/update; join/leave; members; membership decision.
- Endorsements: list/create/accept/decline; operator verification is a CLI task.
- Commentary: conversations/list/detail/delete; messages with request_id + context;
  reset memory; provider connections with secret-free serialized responses.
- Calendar: today/upcoming, with instant, latitude, longitude, IANA timezone,
  and bounded days. Unresolved Aviv and pending months remain explicit.

Shared types: ../shared/productContracts.ts. Contexts use the existing davar-v1
reference shape, with source edition and word index kept separate from display IDs.
Provider/model/prompt/input hashes describe generated answers; they never mark
an answer as a reviewed translation or definition.

## Imports and operations

All imports default to dry run, wrap changes in a transaction and fail on missing
identities or violated constraints. Set IMPORT_FILE to an operator-reviewed JSON
manifest, then run from api/:
- `bundle exec rails davar:import_qahal`
- `bundle exec rails davar:import_articles`
- `bundle exec rails davar:import_observations`

Set APPLY=1 only after reviewing the report. Reports for Qahal contain sensitive
source-to-user ID mappings; keep them out of the public repository and logs.

Qahal format: schema_version=1, source_revision, decrypted=true, users
(telegram_id, display_name, profile, discoverable, contact_visible), assemblies
(id, leader_telegram_id, name, kind, city, approximate coordinates), memberships
(telegram_id, assembly_id, state). Existing encrypted D1 envelopes require an
authorized decryption/export first; source keys are not Rails keys. Imports do
not automatically grant admission or leader verification.

Articles: schema_version=1, source_revision, articles with source_id, title,
locale, source_url, attribution, references, permissions, body, publication_state.
Public display and AI grounding are distinct explicit permissions. No private
transcripts are imported. No content is invented when a permitted manifest is absent.

Observations: schema_version=1 and observations using Bore's persisted shape.
Verified unaided INMS sightings in Israel can confirm months. Source hash changes
update observations; retracted confirmation is removed while evidence persists.

### Live calendar

Development, staging and production use the same public INMS RSS feed, pinned
Bore parser and Rails import. From `api/`, after `bundle exec rails db:migrate`:

```sh
bundle exec rails davar:sync_calendar
```

The initial sync imports the latest 50 reports (currently several years of history).
Run the same command every 15 minutes through the host scheduler with that
environment's database and `PYTHON_BIN`. Alternatively, supervise this process:

```sh
bundle exec rails davar:watch_calendar
```

The development sandbox runs this watcher alongside the API. `setup` imports real
reports; `api/bin/dev-sandbox calendar live` restores live mode after explicit
`confirmed` or `pending` test scenarios. Real observations survive scenario changes
and sandbox resets. Synthetic witnesses never enter the live calendar.

Feed hashes make repeated syncs idempotent. Multiple witnesses and repeated reports
produce one confirmation for an observed evening; later sightings within the same
report do not start another month. Corrections retain retracted witnesses with
`verified=false`; remaining evidence can continue supporting the confirmation.
An absent older post in the rolling feed is not a retraction. Malformed feeds,
unavailable sources and uncertain tables retain the last valid evidence. Uncertain
reports are stored in `calendar_source_entries` with their source, raw report, hash
and review reason. Only an unambiguous changed report replaces its prior witnesses.

The API adds `generated_at`, `next_sunset_at`, `timezone`, source freshness and
per-day observation provenance. Clients refresh at the supplied sunset boundary,
every 15 minutes and on resume. A cached response retains its original timestamp
and day; the UI identifies an outdated response instead of calculating a new date.
The selected city/timezone stay on the device. No account is required.

Check `CalendarFeedState.current` for the last attempt/success and review count.
Source freshness becomes stale after two hours without a successful sync or after
a failed fetch. Historical reports awaiting review do not suppress confirmed dates.
Aviv, Biblical month identity and dependent festivals remain unresolved under the
pinned policy; neither INMS month titles nor forecast text supply an Aviv anchor.

Schedule `bundle exec rails davar:deliver_notifications` for the durable outbox.
Delivery is at least once: a crash after Telegram accepts a message but before
the database commits may cause a duplicate. No production notifications were sent.

Operator tasks: `bundle exec rails davar:issue_invitation` and
`USER_ID=... bundle exec rails davar:verify_leader`.

Production requires TLS, explicit allowed hosts/origins, SMTP, stable encryption
keys, database backups and a configured notification scheduler. Back up encryption
keys alongside the database; rotating deterministic identity encryption requires
a controlled re-encryption/index migration. Never discard old keys.

Expo web's existing SQLite WASM worker requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on its host. Register an HTTPS web callback separately from `davar://auth/callback`; native linking needs a new development build.

Bore parity: from api/, `PYTHONPATH=lib/bore python -m pytest test/bore -q`. Tests are copied unchanged from the pinned upstream revision.

Schedule `bundle exec rails davar:recover_consultations` every minute alongside notification dispatch. It fails/refunds pending sponsored responses older than ten minutes exactly once. Requests have bounded provider timeouts; persisted messages survive process termination.

## Deployable unit and release checks

Package this repository with `api/` and the existing
`data/knowledge/registries/books.json`: context validation uses that canonical
registry. Install Ruby/Bundler and Python dependencies in the same deployment
image. Run `bundle exec rails db:migrate` from api/ as a release step before
starting Puma. Supply DATABASE_URL, SECRET_KEY_BASE, all three encryption keys,
API_PUBLIC_URL, API_HOSTS, WEB_ORIGINS and AUTH_RETURN_URIS through the host secret
manager. Keep a backup of encryption keys separately from database backups;
changing deterministic keys requires a planned re-encryption and index migration.
Do not reuse the development/test keys in a hosted environment.

Schedule notification delivery and consultation recovery externally. Both tasks
use database state instead of relying on the default in-process Active Job queue.
Observe health at `/up`; redact private response bodies and import reports in
host logs. Roll out migrations and compatible API consumers before releasing a
new native runtime. No deployment or native publication has been performed here.

The iteration's actual validation and remaining prerequisites are recorded in
`../docs/architecture/DAVAR_VNEXT_ITERATION_REPORT.md`.

## Credential-free local sandbox

Follow [the manual-testing guide](../docs/architecture/DAVAR_V2_MANUAL_TESTING.md).
From the repository root, `api/bin/dev-sandbox setup` prepares an isolated PostgreSQL
cluster and synthetic fixtures; `api/bin/dev-sandbox start` runs Rails, web and Expo.
The launcher sets `DAVAR_DEV_SANDBOX=1` only in development. Staging and production
reject the flag. The local inbox/status routes exist only in sandbox development
and require loopback requests. No external AI, geocoder, email or Telegram calls
are made by the simulated integrations. OAuth adapters remain unchanged.
