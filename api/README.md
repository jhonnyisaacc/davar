# Davar API

Rails 8.1, Ruby 3.4.9, PostgreSQL, and Python 3.13. Rails owns user/domain
persistence; immutable Scripture remains in existing static delivery and SQLite.
Bore is adopted behind an isolated server-side Python boundary, pinned in
lib/bore/UPSTREAM.md. No client calculates Biblical dates.

## Local development

The root `../mise.toml` declares Ruby and Python. With Mise activated in your
shell, run `mise trust` and `mise install` from the repository root to select and
install the project runtimes. For Zsh, add `eval "$(mise activate zsh)"` once to `~/.zshrc`
and open a new terminal. Verify `ruby --version` reports 3.4.9.
If shell activation is unavailable, prefix the commands below with `mise exec --`.

From api/:
- `bundle install`
- `cp .env.development.example .env.development` and fill in local settings.
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

Development CORS also allows Bun's HTML server on port 5174 and the default
web/Expo ports on localhost, 127.0.0.1, and 0.0.0.0, even with an existing
WEB_ORIGINS setting. Add custom ports or LAN browser origins to WEB_ORIGINS.
Staging and production allow only their configured origins.

The project uses Rails on 3000, web/static data on 5173, Expo/Metro on 8081,
and PostgreSQL on 5432. Keep Rails running alongside Expo: Commentary questions
first create or restore an API session, then submit messages to Rails. Starting
Expo alone does not start the API.

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

Examples contain no credentials. In development, `dotenv-rails` automatically
loads local `.env` files from `api/`; use `.env.development` for local settings.
Existing shell variables take precedence, followed by `.env.development.local`,
`.env.local`, `.env.development`, and `.env`. Real `.env` files are Git-ignored.
The gem loads only in development, so automated tests and hosted environments do
not read these files. Staging and production use their host secret managers. From api/,
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

## OpenRouter commentary in development

Rails does not load `.env` files by itself; `dotenv-rails` supplies that behavior
for local development. Use `api/.env.development` (rather than `.development.env`)
and set both variables:

```dotenv
OPENROUTER_API_KEY=your-development-api-key
OPENROUTER_MODEL=provider/model-id:free
```

Choose a free model ID from the [OpenRouter models catalog](https://openrouter.ai/models).
Restart Rails after changing the file. When the key and a free model are present and Rails is
in development, every commentary request uses the server's OpenRouter configuration
instead of personal provider connections or simulated AI. This also works with
`api/bin/dev-sandbox start`; its other simulated integrations remain active and
the development banner identifies live AI. No provider connection is required,
and these development requests do not consume the sponsored consultation quota.
The usual request throttling, authorized grounding, conversation ownership,
history, failure handling, and retry deduplication still apply.

The development override also requires `ai_shared_openrouter`. With the key absent
or the development model unset or paid, the enabled personal connection, shared
free model, or sandbox path applies. Staging and production ignore `OPENROUTER_MODEL`; shared AI uses
`SHARED_OPENROUTER_MODEL` and only accepts `openrouter/free` or a `:free` model.
The key stays in Rails; never put it in `PUBLIC_*` or `EXPO_PUBLIC_*` variables.
Only empty placeholders are committed in the example files.

## Feature flags and release controls

Rails evaluates three flags in the Davar PostHog project (644359) using the US
endpoint `https://us.i.posthog.com/flags?v=2`. Put `POSTHOG_PROJECT_TOKEN` and
`POSTHOG_HOST` in the server environment; local credentials belong in the ignored
`api/.env.development.local`. No PostHog personal API key or browser SDK is required.

- `ai_provider_connections`: enables personal API key connections. The server's
  comma-separated `AI_CONNECTION_PROVIDERS` allowlist also controls each provider;
  it starts empty. Supported IDs are `claude`, `grok`, `chatgpt`, and `gemini`.
  Muse is unavailable until an actual integration exists. API key connections
  are distinct from account sign-in; approved provider OAuth can be added later.
- `ai_shared_openrouter`: enables shared AI with `OPENROUTER_API_KEY` on the server.
  Hosted environments use `SHARED_OPENROUTER_MODEL=openrouter/free` by default.
  Requests enforce zero prompt/completion pricing and no paid fallback. Limits
  are 3 requests per minute per account, 20 per minute globally, and
  `SHARED_AI_DAILY_LIMIT=50` globally per UTC day. This shared free quota is finite;
  provider availability and upstream limits may be lower. Personal connections
  take precedence in hosted environments and do not consume the shared quota.
- `assemblies`: hides Assemblies navigation and protects its API and admission
  endpoints. Existing registration, admission, and membership rules still apply.

All three start disabled. Both apps read `/api/v1/capabilities` and show Shaul's
public articles whenever AI is disabled, unconfigured, or unavailable. The article
API includes the existing validated public Shaul corpus, preserving the exact
source text and attribution, alongside explicitly published imported articles.
It serves 50 articles per page with a `next_offset`; private, draft, or unpermitted
material remains excluded. YAML metadata is omitted from the reading view; prose
and source credits are preserved. Provider keys remain encrypted in Rails and never appear in responses. Failed evaluation
or missing flags disable the feature. Evaluations are cached for 30 seconds per
account and environment; apps refresh on focus/resume and every minute, without
persisting enabled capabilities offline. No prompts, emails, or credentials are
sent to PostHog, only a pseudonymous account ID and the Rails environment.

After changing server environment settings, restart Rails. For hosted rollout,
configure its environment and deploy the API and app changes before enabling the
flags in [Davar PostHog](https://us.posthog.com/project/644359/feature_flags).
Shared OpenRouter's live model availability must be checked in that environment.

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

## Shaul-backed Commentary

The local corpus copies public Shaul notes and knowledge verbatim from revision
`8c94b0fe9eca817e22340430309801d0ef76125b`. Ingestion does not call an LLM or
change source files, editorial claims, knowledge schemas or Scripture datasets.
The original repository license and note credits remain in the artifact.
Private directories, drafts, templates, private-path disclosures and authoring
guidance are excluded with reasons in the coverage report.

From the repository root, prepare a separate checkout and generate the corpus:

```sh
git clone --no-checkout https://github.com/jhonnyisaacc/shaul.git /private/tmp/davar-shaul
git -C /private/tmp/davar-shaul checkout --detach 8c94b0fe9eca817e22340430309801d0ef76125b
python3 -m scripts.commentary.build --shaul-root /private/tmp/davar-shaul
```

PyYAML is required. Outputs are ignored in `data/commentary/generated/`:
`corpus.json` contains exact UTF-8 text, hashes, byte/line locations and search
indexes; `report.json` accounts for every discovered record and lists unresolved
references, broken links and existing traceability findings. Unverified reference
numbering stays in Shaul's native labels; selected Davar verses match only verified
mappings. Native reference searches such as `Juan 1:51` do not assert a numbering
conversion.

Rails defaults to `../data/commentary/generated/corpus.json`. Set
`COMMENTARY_CORPUS_PATH` to use another artifact and `COMMENTARY_EVIDENCE_BYTES`
to adjust the default 32768-byte evidence budget (1024–131072). Tests use synthetic
sources unless a corpus path is explicitly configured. Refreshes are explicit:
build into a new empty directory with `--output`, review its report, then switch
the path. Startup/search verifies artifact, source and section hashes and caches
the result in memory. No database import or external search service is needed.

Search prefers original aliases, concept links and references, then keywords.
Evidence includes at most three sources and six complete sections, including each
note's scope, cautions and credits. Sources whose necessary sections cannot fit
are omitted. A normal matched question uses one generation call. Short follow-ups
reuse source IDs revalidated against the current corpus; explicit new topics take
precedence. Responses must contain answer text and known cited source IDs; invalid
responses fail and refund sponsored consultations. Local OpenRouter requests use
JSON mode, with the response schema and allowed source IDs in the prompt.
Live checks with the configured development model failed with nested `json_schema` requests.
Rails checks the returned structure and citations. Answers use short, plain
"What it is / What it is not" blocks, with a brief specific caution when needed.
The provider returns separate labels and lists with at most two points each;
Rails validates and formats them as ordinary answer text for both clients.
The existing string answer format remains accepted for provider compatibility.
Missing coverage produces a clear response without an LLM call or quota charge. Existing permitted articles
remain supported. Citations show source titles and section labels and open the
original file at the pinned revision.

Validation from the repository root:
`python3 -m pytest -q tests/test_commentary_corpus.py tests/test_knowledge_*.py`.
From `api/`: `PYTHON_BIN=/path/to/python mise exec -- bundle exec rails test`.
From `mobile/`: `bun test`, `bun run typecheck`, and `bun run lint`.
From `web/`: `bun test`, `bun run typecheck`, and `bun run lint`.

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
Valid live calendar requests can bootstrap missing observations and recover a
due sync during the new-month observation window. Concurrent calendar requests
reuse the sync that completes under the database lock. Failed attempts retain
the last good observations and wait 30 minutes before retrying. Explicit sandbox
scenarios do not fetch the live feed.
This lets an ordinary Rails server populate the calendar without a separate
watcher; the first request may take longer while it fetches and imports the feed.

Solid Queue persists `SyncCalendarObservationsJob` in the same PostgreSQL database
and schedules it every 30 minutes in development, staging and production through
`config/recurring.yml`. Puma starts its worker and scheduler automatically, including
normal `bundle exec rails server` startup and the development sandbox. During
macOS development, the worker and scheduler use threads inside Puma to avoid
Objective-C runtime crashes after `fork`. Other platforms and hosted environments
use the default fork mode. Restart `bin/dev` after changing the Puma configuration.

The job fetches reports only from 30 minutes before Jerusalem sunset on the earliest
possible last day of the observed lunar month (29 days after its starting evening).
It continues polling every 30 minutes until the next sighting is imported, including
delayed reports. A calendar with no sightings bootstraps immediately. Once a new
month is confirmed, polling waits for its next month boundary. This uses the lunar
month end rather than a Gregorian month end.

For a dedicated worker, set `SOLID_QUEUE_IN_PUMA=0` on the web process and supervise
`bundle exec ruby bin/jobs` with the same environment, database and `PYTHON_BIN`.
The migration adds queue tables to the application's existing database. The
`calendar` queue is the only worker queue configured here. Completed jobs are
cleaned up hourly. Explicit `davar:sync_calendar` forces an operator-requested
sync; scheduled jobs and request recovery share the 30-minute database guard.

The older supervised watcher remains an alternative to Solid Queue:

```sh
bundle exec rails davar:watch_calendar
```

Use one scheduling approach per deployment. Sandbox `setup` imports real
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

Historical 2026 evidence also comes from INMS's linked public sightings spreadsheet.
`config/calendar_observation_backfill.json` supplies the two March 20 unaided Israel
witnesses that are absent from the forecast-only blog post. The normal sync imports
this reviewed supplement when that post appears in the feed. Hash-bound date reviews
in `config/calendar_report_reviews.yml` recover the February 18 and June 16 witness
tables, whose dates are corroborated by the spreadsheet. Their original report hashes
and review provenance are retained; a changed report revision requires a new review.
May has no confirmed Israel sightings in either source and remains unresolved.

The API adds `generated_at`, `next_sunset_at`, `timezone`, source freshness and
per-day observation provenance. Clients refresh at the supplied sunset boundary,
every 15 minutes and on resume. A cached response retains its original timestamp
and day; the UI identifies an outdated response instead of calculating a new date.
The selected city/timezone stay on the device. No account is required.

Check `CalendarFeedState.current` for the last attempt/success and review count.
Source freshness becomes stale after two hours without a successful sync during an
open observation window, or after a failed fetch. A successful source remains current
between month-end windows. Historical reports awaiting review do not suppress dates.
Aviv remains unresolved under the pinned policy; neither INMS month titles nor
forecast text supply an Aviv anchor. Explicit maintainer month identities live in
`config/calendar_month_anchors.yml`. The September 12, 2026 unaided sighting is the
seventh-month anchor, so its month is Etanim and day 22 is Shemini Atzeret. The
Davar bridge applies that identity and Bore's festival rules, with
`month_identity.status=manual` and the anchor's provenance in the response.
This does not mark annual Aviv determination as confirmed. Adjacent confirmed
29/30-day month starts can inherit an ordinal; a missing report breaks that chain,
and an unconfirmed or retracted anchor supplies no month or festival identity.
The reviewed January and March month identities identify historical months as well;
the March observations provide Aviv dates for Pesach and Jag HaMatzot.

Davar explicitly selects the weekly Shabbat during Aviv 15–21 for the wave-sheaf
rule (Leviticus 23:11, 15–16). Yom HaBikurim is the following Sunday, counted as
day 1; Shavuot is day 50, exactly 49 elapsed days later. `counted_moadim.py` adds
these events at the Rails boundary while preserving Bore's pinned domain rules.
For the March 20, 2026 sighting, the daytime dates are April 5 and May 24, beginning
at local sunset the preceding evening. Counted events retain their confirmed Aviv
evidence and counting rule in `counted_events`. Missing later month sightings do
not invalidate the count or fabricate a Biblical month/day. Annual lists show the
civil date when that month's Biblical date remains unknown.
Clients display the Biblical day/month and events as primary, with the separate
rabbinic date in smaller text. The manual refresh CTA is removed; sunset, periodic
and resume refreshes remain automatic.

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
Start local PostgreSQL on its default port 5432. From the repository root,
`api/bin/dev-sandbox setup` prepares a separate `davar_v2_sandbox` database and
synthetic fixtures; `api/bin/dev-sandbox start` runs Rails, web and Expo on the
same project ports as normal development. Stopping the sandbox leaves PostgreSQL running.
The launcher sets `DAVAR_DEV_SANDBOX=1` only in development. Staging and production
reject the flag. The local inbox/status routes exist only in sandbox development
and require loopback requests. By default no external AI, geocoder, email or
Telegram calls are made by the simulated integrations. Configuring both
`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` opts commentary into live AI as described
above. OAuth adapters remain unchanged.


Assemblies testing includes 25 synthetic personas covering admission, resumable
onboarding, membership, leader endorsements and contact consent. The seven-digit
sandbox invitation is **1234567**. See the [account matrix and sign-in guide](../docs/architecture/DAVAR_V2_MANUAL_TESTING.md#accounts-and-email-sign-in)
and [Assemblies QA report](../docs/qa/ASSEMBLIES_QA.md).

To add the fixtures to an existing local development database without resetting
other data, run from `api/` with the development environment configured:

```sh
DAVAR_DEV_SANDBOX=1 bundle exec rails runner 'DevelopmentFixtures.seed!'
```

Seeding preserves existing persona progress. `api/bin/dev-sandbox reset` resets
fixture-owned records in the launcher's sandbox database; use it only when a
fresh scenario run is needed.
