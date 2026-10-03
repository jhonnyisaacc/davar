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
OPENROUTER_MODEL=provider/model-id
```

Choose the full model ID from the [OpenRouter models catalog](https://openrouter.ai/models).
Restart Rails after changing the file. When both values are present and Rails is
in development, every commentary request uses the server's OpenRouter configuration
instead of personal provider connections or simulated AI. This also works with
`api/bin/dev-sandbox start`; its other simulated integrations remain active and
the development banner identifies live AI. No provider connection is required,
and these development requests do not consume the sponsored consultation quota.
The usual request throttling, authorized grounding, conversation ownership,
history, failure handling, and retry deduplication still apply.

With either value absent, the existing provider/sandbox behavior applies.
OpenRouter is rejected outside development even if its environment variables are
set. Staging and production continue to use personal connections and `FREE_AI_*`.
The key stays in Rails; never put it in `PUBLIC_*` or `EXPO_PUBLIC_*` variables.
Only empty placeholders are committed in the example files.

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
