# Davar v2 iteration report

Date: 2026-09-30. Branch: feat/davar-v2. Base: freshly fetched origin/main,
 c10a71a7480a069dad65ea7bbaae8180e2b32b58 (merged design PR #249).

## Executive summary

Davar now has a PostgreSQL-backed Rails domain for accounts, verified identities,
revocable sessions, synchronized settings, admission, Assemblies, conversations,
provider connections, permitted articles, notifications and calendar observations.
Expo and the existing React web app consume versioned APIs. Scripture remains
anonymous and retains static delivery and SQLite reading. One canonical draft PR
contains the iteration; live integration prerequisites and native QA remain open.

This is working application/domain code with migrations and regression coverage.
It does not claim that the issue backlog, provider onboarding, content permissions,
calendar theology or App Store release is complete.

## Architecture before and after

Before, Davar's clients consumed Scripture assets and dictionaries while Qahal,
Bore and Shaul owned separate product domains. After, Rails owns transactional
user-domain state and authorization, using PostgreSQL and encrypted private fields.
The existing biblical-knowledge registries remain the reference authority.
Immutable reading assets do not pass through Rails. Client caches distinguish
public content and account-owned responses; switching accounts or logging out
invalidates private state and rejects late responses.

Bore's MIT-licensed Python domain with preserved algorithms is pinned behind a Rails JSON bridge.
Python is a backend runtime dependency, not a client algorithm. Rails owns its
observation persistence. Translation/evidence jobs may reuse provider transport
and provenance utilities, but have separate future orchestration and permissions.

## Implemented work

- Rails: API-only application, PostgreSQL migrations, domain services, assembly
  policies, versioned account/assembly serializers, ownership checks, persistent
  throttles, single-use auth attempts/handoffs, encrypted personal data and keys.
- Authentication: Google, Apple, Facebook, Telegram, X and email magic-link
  adapters. Signed OIDC claims validate signature, issuer, audience, expiry and
  nonce. Linking requires fresh proof and the current account; matching email
  does not merge users. Telegram preserves its legacy numeric identity for Qahal.
- Assemblies: invite capacity/expiry, saved Starting questions 1/3 or all seven,
  path/name/gender/city/visibility onboarding, hidden-by-default discovery,
  approximate city/radius search, Local/Online lists, one current membership,
  transactional requests/decisions, management, two named leader endorsements,
  consent controls and notifications. Mobile and web use the same domain.
- Commentary: persistent conversations/messages, owned history, structured
  source contexts, memory extracts/reset, deletion, provider connections and
  disconnect actions. One sponsored consultation is enforced server-side, with
  idempotency, failure refunds and operator recovery of abandoned requests.
  Pending generation prevents concurrent deletion. Four API-key transports are
  implemented; Muse awaits an actual provider contract.
- Articles: explicit published/public-display permission and attribution; separate
  permission to send content as AI grounding. Import tooling rejects unpermitted
  or private records. No Shaul production content has been imported.
- Scripture handoff: mobile long presses and explicit web actions transfer the
  canonical source book/chapter/verse, distinct edition and optional word index.
  Normal lexical taps and reading navigation retain their existing behavior.
- Calendar: today/upcoming APIs, observation provenance and retraction-aware
  import, sunset-based lookup, pending months and unresolved Aviv. Mobile Widgets
  and web calendar use backend results and public approximate city selection.
- Settings: explicit save/load with optimistic versions and reader dependency
  normalization; six-provider linking and logout. Native credentials use
  SecureStore; web bearer tokens remain in memory.
- Contracts: optional backward-compatible artifact metadata for locale,
  separately versioned text/definitions, review/publication, permissions and
  input hashes. Fixtures retain distinct NA28/NA29 editions and contextual
  relationships. Only generated input-manifest/bundle hashes were refreshed.
- Operations: local PostgreSQL compose setup, API CI, configuration examples,
  operator import/admission/verification tasks, durable notification outbox and
  consultation recovery. Deployment prerequisites are in api/README.md.

## Data model and APIs

Users have multiple provider identities, sessions, conversations, provider
connections, notifications and memberships. Assemblies have one leader and
membership requests. Endorsements tie an applicant to two distinct leaders.
Invitations have transactional usage limits. Conversations own encrypted messages
and memory; messages preserve provider/model/prompt/input provenance. Articles
retain source IDs/revisions/permissions. Observations preserve evidence hashes and
provenance separately from eligible month confirmations.

All new endpoints use /api/v1. Shared consumer types live in
shared/productContracts.ts. Private responses use no-store. Imports are
operator-reviewed, idempotent and dry-run by default, with reconciliation mappings;
Qahal reports contain sensitive identifiers and must stay outside public logs.

## Design evidence

The canonical source is design/davar.pen, inspected directly with the Pen MCP.
Read design tokens and actual components/frames: y4O4rD (LiquidGlass navigation),
k1nmfo (Desktop navigation), KJxHi (chat welcome), WCl8K (chat thread), ruL6v
(provider gate), Assemblies onboarding/discovery frames, UbJM5 (Widgets home),
RHcmC (calendar), pending/unknown calendar states. Mobile uses the warm light/dark
palette, Inter/Manrope typography, Lucide icons, compact dock and anchored composer.
Desktop navigation uses the actual wordmark/area pills. The exported Commentary
welcome was visually compared through the MCP browser screenshot.

Design copy promising unsupported consumer OAuth or training guarantees was not
used: provider connections accurately describe API credentials. This review does
not establish complete pixel parity or native safe-area/keyboard/RTL approval.

## Preserved and replaced behavior

Preserved translation selection, versification/source IDs, Qumran interactions,
contextual dictionary duplicates, static Scripture delivery and offline data file.
The previous tab shell is replaced by the five destinations; legacy routes remain
available. SQLite opening is now asynchronous/lazy, retaining davar.db while
avoiding a synchronous worker failure in Expo web. Metro includes WASM assets.
No licensed edition, private dataset, token, secret or source repository was changed.

## Tests and validation

Actual local commands/results, run from the indicated directory:

| Directory | Command | Result |
| --- | --- | --- |
| api/ | bundle exec rails db:migrate | Applied all five migrations to isolated local development PostgreSQL; test schema prepared separately |
| api/ | bundle exec rails zeitwerk:check | Pass |
| api/ | bundle exec rails test | 33 tests, 137 assertions, zero failures/errors/skips |
| api/ | PYTHONPATH=lib/bore python -m pytest test/bore -q | 12 passed |
| mobile/ | bun test | 19 passed, 85 assertions |
| mobile/ | bun run typecheck | Pass |
| mobile/ | bun run lint | Pass; five pre-existing array-type warnings |
| mobile/ | EXPO_PUBLIC_API_URL=http://127.0.0.1:3000 bunx expo export --platform web | Pass; 31 static routes |
| web/ | bun run lint | Pass |
| web/ | bun test | Final run: 69 passed / 389 assertions after regenerating static assets; earlier stale TCY fixture failure reproduced in original checkout |
| web/ | bun ./build.ts | Pass; static TS2009 export disabled |
| web/ | bunx tsc --noEmit | Existing baseline errors in ensure-static-data, staticData/test fetch typing and transliteration test expectations; no new product file errors observed |
| root | python -m pytest tests/test_knowledge_*.py -q | 80 passed |
| root | git diff --check | Pass |

Rails commands used Ruby 3.4.9, PostgreSQL 17 on isolated port 55432 and
PYTHON_BIN pointing to a disposable Python 3.13 environment. No production
migration, notification, remote import or deployment ran. Tests use mocked AI
and mail delivery, signed locally generated OIDC fixtures and real PostgreSQL
transactions including competing membership acceptance. They are not live
provider end-to-end validation. Cache tests cover network loss, mutation
invalidation, account isolation and late responses after logout. Bore scenarios
cover sunset, eligible evidence, pending months and unresolved Aviv.

## Migration and release requirements

Provision PostgreSQL and stable production encryption keys; back up both before
migration. Configure hosts/origins, auth return allowlists, provider app callbacks,
SMTP and API domains. Package the canonical book registry alongside api/ and
install Ruby and Python dependencies. Schedule notification delivery and recovery
with the documented tasks. Do not rely on in-process jobs for crash recovery.

Qahal migration needs an authorized decrypted export of its existing versioned
AES-GCM envelopes, preserved numeric Telegram IDs and reviewed reconciliation.
Run dry-run first; do not automatically infer admission or leader verification.
Shaul import needs a per-record publication/permission manifest. Calendar
observations need a reviewed source ingestion process before operational dates
can be confirmed. Native SecureStore/Blur dependencies and runtimeVersion 1.0.2
require a future native build and submission, separately from this PR.

## Constraints and blocked work

See DAVAR_VNEXT_CONSTRAINTS.md and DAVAR_V2_ISSUE_ALIGNMENT.md for the maintained
prerequisite/status matrix and issue ownership.

| Task | Root cause / attempt | Missing prerequisite / impact / next action |
| --- | --- | --- |
| Six-provider live sign-in/callbacks | Adapters, signed claim tests and callback contracts implemented; app credentials unavailable | Register provider apps and native/HTTPS callbacks; run live linking/revocation tests |
| Live magic-link delivery | Replay/expiry/mail-test delivery covered | SMTP and verified sending domain; verify delivery and deep links |
| Sponsored/provider AI responses | Mocked transport, isolation, quota and recovery covered | Sponsored key/model and real account keys; verify actual provider responses/errors |
| Muse | No supported API/auth contract in supplied sources | Identify supported provider contract before implementing adapter |
| Qahal remote migration | Dry-run, repeat import and constraints tested with fixtures | Authorized decrypted export/keys and reconciliation review; no users moved |
| Shaul articles | Permission-gated import and evidence boundary implemented | Approved display/AI manifest; no production corpus copied |
| Live calendar | Pinned parity and observation imports implemented | Reviewed observations and owning Bore #1 Aviv decision; retain unresolved states |
| Telegram delivery | Explicit bot-access authorization and consent tested; outbox implemented | Configured bot/scheduler and live consent test; no messages sent |
| Native release QA | Expo export and actual Pen comparison performed | Device/simulator validation of callbacks, safe areas, keyboard, dark mode, Hebrew RTL and connectivity remains required before ready-for-review |

## Deferred scope and risks

Notes, public profiles, future translation pilots, native widgets, CLI and
publication are outside scope. No unused translation/job/review subsystem was
scaffolded. Existing theological ambiguities remain in their owning domains.

Remaining risks: web sessions intentionally reset on full browser reload; anonymous
consultation limits combine account quota with IP throttling and can be bypassed by
creating accounts; notification delivery is at least once and may duplicate after
an acknowledgement crash; provider latency holds a synchronous request; city
search depends on an external geocoder; private caches are bounded in-memory
fallbacks rather than full offline synchronization; discovery is bounded and may
truncate dense regions; content/memory must be reviewed under actual provider
privacy terms. New domain UI copy remains English while respecting RTL direction;
full translation and native visual/accessibility review remain outstanding.

## Recommended continuation

Configure and validate external integrations, review production import manifests,
complete native/design/RTL/accessibility acceptance and keep static fixtures
regenerated before validating web tests. Keep the canonical PR draft until these material checks are
resolved. Revisit ready-for-review with actual evidence; do not treat architecture
extension points as completion of the linked backlog.

## CI follow-up

Initial PR checks passed mobile, web, Python, policy, foundation and read-only
Shaul compatibility. Two new CI failures were repaired: the Bundler lockfile now
includes x86_64-linux, and the foundation boundary accepts only the exact optional
manifest artifact field, append-only contract documentation and generated metadata
hash refreshes. Three new guard tests prove changes to existing schema requirements,
reading payloads, input revisions and unrelated paths remain rejected. The pinned
Shaul non-interference boundary passed locally. Legacy generator comparison remains
part of the existing required workflow; final remote results are reported on the PR. Publication fixtures use the
existing test_knowledge_ discovery prefix so the foundation workflow runs them.

## Environment follow-up

Development, staging and production are explicit Rails environments with separate
database names and configuration examples. Staging reuses production runtime
protections and requires its own injected database, domains and secrets. Hosted
boot tests verify production-style SSL/eager-loading/error settings, environment
selection, database configuration and rejection of missing secrets/databases or
HTTP API URLs. Tests do not connect to a hosted database. Infrastructure
provisioning and live provider configuration remain operator prerequisites.

## Local sandbox follow-up (2026-09-30)

Development now has an opt-in sandbox with a loopback-only inbox and status API.
Email uses normal identity creation, session issuance, callback exchange and
admission. Staging and production boot rejects the sandbox flag. Six repeatable
accounts, two leader assemblies, membership requests, an invitation and an
attributed synthetic article support manual testing. Signed city fixtures,
deterministic labeled AI responses and no outbound Telegram delivery require no
external credentials. Consultation limits, failed-request refunds, ownership and
provider connection checks still use the normal Rails services. Calendar scenarios
supply synthetic evidence to pinned Bore, retaining unresolved Aviv.

The ports below record the original validation run. Current development and
sandbox defaults are Rails 3000, web 5173, Expo 8081, and PostgreSQL 5432 with
a separate sandbox database; see `DAVAR_V2_MANUAL_TESTING.md`.

`api/bin/dev-sandbox` managed its own PostgreSQL cluster on 55433 and recorded
Rails/web/Expo process groups; occupied ports stop startup. Expo uses 8086 because
8082 belongs to another checkout. Reset removes fixture-owned records, including
assemblies created during testing, and leaves unrelated users intact. The
[manual-testing guide](DAVAR_V2_MANUAL_TESTING.md) contains commands, accounts,
URLs and an unchecked acceptance checklist. Browser and native return URLs are
separate; Expo web uses its origin rather than a native scheme.

Automated validation after this follow-up:

| Directory | Command | Result |
| --- | --- | --- |
| api/ | `bundle exec rails test` | 39 tests, 170 assertions passed |
| api/ | `PYTHONPATH=lib/bore python -m pytest test/bore -q` | 12 passed |
| root | `python -m pytest tests/test_knowledge_*.py -q` | 80 passed |
| mobile/ | `bun test` | 20 passed |
| mobile/ | `bun run typecheck` | Passed; generated Expo route typing repaired |
| mobile/ | `bun run lint` | Passed; five existing warnings |
| web/ | `bun test` | 69 passed |
| web/ | `bun run lint` | Passed |
| root | `api/bin/dev-sandbox setup` | Passed, frozen installs, Python dependencies, PostgreSQL, fixtures and web build |
| root | `api/bin/dev-sandbox start`, `reset`, `stop`, `calendar confirmed`, `calendar pending` | Passed setup smoke tests; ports released and services restarted |
| mobile/ | `EXPO_PUBLIC_API_URL=http://127.0.0.1:3000 EXPO_PUBLIC_DEV_SANDBOX=1 bunx expo run:ios --device 'iPhone 17' --no-bundler` | Local iOS 26.4 simulator build installed/launched; zero errors, three build warnings |

Rails checks used mise Ruby 3.4.9, PostgreSQL test port 55432, and the Python 3.13
validation virtualenv; the launcher creates a separate development virtualenv.
Initial checks found and repaired missing mailer autoload registration, fixture
reset foreign-key cleanup, browser callback selection and generated Expo route
typing. Bore tests require `PYTHONPATH=lib/bore`; combined discovery without that
path failed collection and was rerun correctly. Tests keep mailbox filesystem
cleanup in a temporary directory and never remove the live inbox.

Setup smoke evidence: browser Assemblies rendered the sandbox indicator; email
link sign-in and invitation redemption reached onboarding. Simulator Scripture
rendered; simulator Safari opened the local inbox and returned through the native
magic link to authenticated Assemblies showing Sandbox Buenos Aires. Expo web
also rendered Scripture and completed browser email sign-in to authenticated
Assemblies using its browser callback. These are setup smoke
checks, not acceptance of the full user checklist. Simulated provider tests cover
quota, persistence, failure/refund and dummy provider connection; no live OAuth,
AI, email or notification provider was contacted. Existing credentials, authorized
imports, production theology decisions and full visual/device acceptance remain
separate draft prerequisites. No Docker, deployment or EAS publication occurred.
