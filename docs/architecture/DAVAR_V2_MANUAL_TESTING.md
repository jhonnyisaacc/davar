# Davar v2 local manual testing

This is a development-only sandbox for PR #250. UI continues to use `davar.pen`.
Fixtures are synthetic: they are not Scripture evidence, Shaul imports, real
observations, real locations of members, or AI interpretation. The development
banner and status endpoint identify simulations. No hosted deployment or EAS
publication is involved. Staging and production reject `DAVAR_DEV_SANDBOX=1`;
without that flag the normal authentication and integration behavior remains.

## Setup and launch

Use this checkout: `/Users/jhonny/.codex/worktrees/davar-v2/davar`.
Prerequisites: Bun, Ruby 3.4+, PostgreSQL 17, Python 3.13+, Xcode with iPhone 17
simulator, and CocoaPods for native builds. The launcher locates installed mise
Ruby/Python runtimes and Homebrew PostgreSQL; `RUBY_BIN`, `PYTHON_BIN`, `PG_BIN`
and `BUN_BIN` can select alternatives. JavaScript commands use Bun.

From the repository root:

```sh
api/bin/dev-sandbox setup
api/bin/dev-sandbox start
```

Keep `start` running in its terminal. It refuses occupied ports rather than
stopping other checkouts. In a second terminal, from the same root:

```sh
api/bin/dev-sandbox ios
```

This builds/installs locally and opens the development client on iPhone 17. The
simulator build is already installed on this machine. No EAS commands are used.
If the installed client opens an old server, open the following URL in simulator
Safari: `exp+davar://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8086`.
Metro runs in CI mode under the launcher; restart services after changing mobile
source rather than expecting hot reload.

| Surface | URL / port |
| --- | --- |
| Browser app | http://127.0.0.1:3002/assemblies |
| Rails inbox (also simulator Safari) | http://127.0.0.1:3000/development/mailbox |
| Development diagnostics | http://127.0.0.1:3000/api/v1/development/status |
| Expo / optional Expo web | http://127.0.0.1:8086 |
| Isolated PostgreSQL | 127.0.0.1:55433, database `davar_v2_sandbox` |

The browser callback returns to its current Commentary/Assemblies route. Native
returns to `davar://auth/callback`; Expo web returns to its browser origin plus
`/auth/callback`. These exact local URLs are allowlisted by the launcher. Physical
iPhones require a LAN address and corresponding allowlists; loopback setup here
is specifically for the simulator.

## Accounts and email sign-in

No separate authentication provider is required for Assemblies. Select Email,
enter one of these accounts, and send a magic link. Open the local inbox in the
same browser profile; on iPhone open it in **simulator Safari** using the banner
link. Select the newest message for the account and click **Open magic link**.
Accept Safari's **Open in Davar** prompt for native sign-in. This runs the normal
identity resolution, revocable session issuance and one-time callback exchange.
Links expire after ten minutes; request another after expiry or use. The local
delivery backend accepts only `@example.test` addresses.

| Email | Initial fixture state |
| --- | --- |
| fresh@example.test | Not admitted, no onboarding answers |
| starting@example.test | Admitted, Starting, answers 1 and 3 |
| reader@example.test | Admitted, Experienced, all answers; local membership requested |
| applicant@example.test | Admitted leader applicant, awaiting endorsements |
| leader-one@example.test | Verified leader of Sandbox Buenos Aires |
| leader-two@example.test | Verified leader of Sandbox Online |

Invitation code: **DAVAR-LOCAL** (100 uses, thirty-day fixture expiry).
All accounts start hidden from discovery. Two independent verified leaders can
endorse the applicant; discovery choices must remain explicit. Use separate
browser sessions or sign out to switch accounts. Native credentials use
SecureStore; browser sessions intentionally end on full reload. After fixture
reset, sign out/stale-session recovery and sign in again.

## Simulated integrations

For live commentary, copy `api/.env.development.example` to
`api/.env.development`, set `OPENROUTER_API_KEY` and a full `OPENROUTER_MODEL` ID,
then restart Rails. In development these settings override simulated AI and
personal provider connections, without consuming the free consultation quota.
The banner reports **live AI via OpenRouter**; other sandbox integrations remain
active. Clear either value and restart to exercise the simulation and quota cases
below. The API key stays on the Rails server and the local env file is Git-ignored.

- City search: Buenos Aires, Jerusalem, Madrid and São Paulo, approximate centers.
  City selections still use signed tokens and normal profile updates.
- Commentary: one free successful consultation, then a provider connection is
  required. Connect ChatGPT (or another supported provider) using dummy key
  **sandbox-key** and model **development-fixture-v1**. No external AI request is
  made; responses clearly identify development simulation. Conversations,
  source context, ownership and quotas persist in PostgreSQL.
- Send **[sandbox:failure]** to exercise provider failure. Failed sponsored
  requests refund the free consultation; retry with a new request. Connection
  removal must reinstate the usual limit. A failed request stays in history.
- Articles: **Development article — synthetic content**, with explicit fixture
  attribution. Scripture John 1:1 handoff can exercise matching source context.
- Notifications: internal notifications remain testable; no Telegram delivery or
  other external notifications occur. Synthetic meeting/source URLs under
  `example.test` intentionally do not lead to real content.
- Calendar: Rails invokes pinned Bore logic; clients calculate no calendar rules.
  Real public INMS reports are imported by default and refreshed every 15 minutes.
  Explicit synthetic scenarios remain labeled by provenance and the sandbox
  banner; unresolved Aviv remains explicit in all modes.

From repository root, select a scenario and refresh the calendar consumer:

```sh
api/bin/dev-sandbox calendar confirmed
api/bin/dev-sandbox calendar pending
api/bin/dev-sandbox calendar live
```

`confirmed` creates synthetic qualifying evidence four days before today;
`pending` shows a pending calendar while preserving the imported real observations.
`live` restores the real calendar and refreshes the public feed. These scenarios
do not overwrite real evidence. Check source links and next-sunset time in the UI;
reload/reopen the calendar to verify the selected city stays on the device.

## Reset and stop

From repository root:

```sh
api/bin/dev-sandbox reset
api/bin/dev-sandbox stop
```

Reset recreates the six accounts, their sessions/conversations/settings,
fixture-owned assemblies (including ones created by those accounts), memberships,
endorsements, invitation, article and inbox. It removes sandbox observations;
select a calendar scenario again. Other accounts and imports remain intact.
Seeding is idempotent and preserves testing progress; use reset for a clean run.
Rate limits still apply; wait for their window if repeated sign-in attempts are
throttled. Stop targets only processes recorded by this launcher (with matching
start signatures) and its own PostgreSQL cluster. Ctrl+C stops app services;
`stop` also stops PostgreSQL. Runtime state/logs/mail are ignored under `api/tmp/`.
Do not share runtime logs or inbox links. No private corpus is required.

## Manual acceptance checklist (user performed)

- [ ] Fresh sign-in, invitation gating, Starting/Experienced paths, resume answers,
  city selection and hidden-by-default disclosure; invalid/replayed links rejected.
- [ ] Applicant requests endorsements; both leaders approve; repeat/decline paths
  and notifications; verify leader management permissions.
- [ ] Local/Online discovery, radius changes, membership request/accept/decline,
  member removal/leave and one-active-assembly constraint across accounts.
- [ ] One free chat, simulated failure/refund, provider connection/removal, chat
  history, source citations, memory reset and conversation deletion/isolation.
- [ ] Article switching and attribution; Scripture word/verse handoff retains
  reference, edition and token context; translations, lexicon and Qumran behavior.
- [ ] Pending and synthetic-confirmed calendar, today/upcoming, sunset boundary,
  unresolved Aviv; no fixture interpreted as real confirmation.
- [ ] Settings synchronization/conflicts, logout/cache isolation, app restart;
  temporary connectivity loss and recovery without another account's cache.
- [ ] Browser and iPhone: light/dark, Hebrew RTL, safe areas, text size, keyboard,
  scrolling, accessible labels and tap targets against `davar.pen`.

Automated checks and setup smoke tests are reported separately in
`DAVAR_VNEXT_ITERATION_REPORT.md`. This checklist has not been accepted on the
user's behalf. Live Google/Apple/Facebook/Telegram/X, external AI/email delivery,
production imports and release QA still need their own credentials and review.
