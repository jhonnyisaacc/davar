# Assemblies QA

Date: 2026-10-03. Branch: `qa/assemblies`, based on `feat/davar-v2` after the
Assemblies invitation changes were committed and pushed. All fixture data is
synthetic; no release deployment, real email or Telegram delivery was performed.

## Automated evidence

| Surface | Validation | Result |
| --- | --- | --- |
| Rails API | `bundle exec rails test` from `api/` | 83 tests, 555 assertions, passed |
| Rails loading | `bundle exec rails zeitwerk:check` from `api/` | Passed |
| Calendar engine | `PYTHONPATH=lib/bore python -m pytest test/bore -q` from `api/` | 14 passed |
| Web | `bun test` from `web/` | 115 passed |
| Web production bundle | `bun run build` from `web/` | Static assets generated and build passed |
| Web types and lint | `bun x tsc --noEmit` and `bun run lint` from `web/` | Passed; existing calendar lint warnings |
| Mobile | `bun run preflight` from `mobile/` | Types, lint and 47 tests passed; existing lint warnings |
| Mobile bundles | `bun x expo export --platform all --output-dir /private/tmp/davar-assemblies-export` from `mobile/` | iOS, Android and web exported |

The API suite includes 24 Assemblies request scenarios and six development
sandbox tests. Authentication uses real revocable sessions, controllers and
PostgreSQL transactions. The existing membership race test verifies concurrent
acceptance cannot produce two active assemblies. CI now runs the API, web and
mobile suites for PRs targeting `feat/davar-v2`, including 16 web DOM regressions. Asset-dependent web tests run after generation/build.

## Scenario coverage

| Area | Cases |
| --- | --- |
| Admission | Anonymous/guest/unadmitted gates; numeric normalization; one-time consumption; invalid, expired, revoked and exhausted codes |
| Onboarding | Starting/Experienced/Leader; negative answers; resume after interruption; required gender/city/visibility; signed city selections; privilege and coordinate tampering |
| Discovery | Local/Online separation; supported radius; zero/missing/invalid coordinates; empty versus failed/loading results; late response isolation; eligible nearby people |
| Membership | Request/retry/cancel/re-request; accept/decline; leader ownership; one active assembly; account membership serialization; leave; meeting access and revocation |
| Leadership | Verified creation; two independent endorsements; pending/accepted/declined support paths; duplicate/foreign decisions; forbidden metadata updates |
| Privacy | Hidden by default; admission/agreement gates; Telegram opt-in for nearby results and leader member lists; notification ownership; logout and account-state isolation |
| UI | Accessible numeric entry; human-readable status/errors; async action guards; creation versus management form state; RTL ordering; safe-area banner; contact actions |

## Live UI evidence

Used the local worktree API on port 3100 and browser app on port 5300 with an
isolated `davar_v2_assemblies_development` database. The default
`davar_v2_development` database also received all 25 personas through additive
seeding; existing users and persona progress were preserved.

Desktop Chromium: numeric invitation entry, local email callback, fresh account
onboarding entry, female reader discovery, join/pending/cancel, Online search,
sign-out/account switching, local leader management, acceptance, invalid HTTPS
feedback, successful renamed assembly and meeting update. Checked light/dark
and Hebrew RTL direction. A delayed Local response cannot replace Online results
in the DOM regression suite. Phone Safari additionally exercised responsive
invitation slots, sequential numeric entry, keyboard and sign-in rendering.

Native iPhone 18 Pro simulator, iOS 27.0: seven-digit input and keyboard dismissal,
email callback through simulator Safari, expired callback recovery, accepted
membership from web, private meeting visibility, leave/access revocation,
re-request, and light/dark/Hebrew layout. The native access-code field is now
present in the accessibility tree; the development banner clears the status bar.

## Reproducible personas

See the [25-account matrix](../architecture/DAVAR_V2_MANUAL_TESTING.md#accounts-and-email-sign-in)
for exact names and starting state. Use invitation **1234567**; use **7654321**,
**7654322** and **7654323** for expired, revoked and exhausted cases. Requests
are sent to the local development inbox and callbacks still go through normal
identity/session exchange. Seeding is idempotent; reset the fixture-owned
sandbox records only when a clean test run is required.

## Scope limits

Android JS/Hermes export passed; a native Android device run was unavailable
because the host has no Java runtime, emulator image or AVD. Physical-device,
VoiceOver/TalkBack and real third-party OAuth/provider delivery remain release
checks. Existing workspace/onboarding copy is English; invitation and navigation
copy is localized, and Hebrew layout direction was exercised. Arbitrary device
sizes and every browser engine are not certified by this pass.

No auth tokens, inbox links, private text datasets or runtime exports belong in
the PR. The nearby Telegram identity and `example.test` meeting links are synthetic
and are intentionally not contacted.
