# Davar v2 local manual testing

The Rails sandbox launcher has been removed. Start the API from `server/`
([server/README.md](../../server/README.md)). iOS sandbox launch stays
deferred. The persona table below described that launcher's fixtures; the
running seed is the accounts in the server README.

This is a development-only sandbox. UI continues to use `davar.pen`.
Fixtures are synthetic: they are not Scripture evidence, Shaul imports, real
observations, real locations of members, or AI interpretation. The development
banner and status endpoint identify simulations. No hosted deployment or EAS
publication is involved. Staging and production reject `DAVAR_DEV_SANDBOX=1`;
without that flag the normal authentication and integration behavior remains.

## Setup and launch

Use the checkout you are currently developing in.
Prerequisites: Bun, PostgreSQL 17, and Python 3.13+. Start PostgreSQL on port
5432 before the API. JavaScript commands use Bun. iOS sandbox launch stays
deferred.

From `server/`:

```sh
bun install
bun run db:migrate
DAVAR_DEV_SANDBOX=1 NODE_ENV=development bun run dev
```

In other terminals, start web from `web/` with `bun run dev` and mobile from
`mobile/` with `bun run start`. There is no iOS sandbox command.

| Surface | URL / port |
| --- | --- |
| Browser app | http://127.0.0.1:5173/assemblies |
| Development inbox | http://127.0.0.1:3000/development/mailbox |
| Development diagnostics | http://127.0.0.1:3000/api/v1/development/status |
| Expo / optional Expo web | http://127.0.0.1:8081 |
| PostgreSQL | 127.0.0.1:5432, database `davar_v2_development` |

The browser callback returns to its current Commentary/Assemblies route. Native
returns to `davar://auth/callback`; Expo web returns to its browser origin plus
`/auth/callback`. These local URLs are the development defaults. Physical
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
| fresh@example.test | Invitation required; no onboarding |
| onboarding-path@example.test | Admitted; choose a path |
| onboarding-questions@example.test | Experienced path; resume after question 2 |
| onboarding-name@example.test | Answers complete; name and gender required |
| onboarding-city@example.test | Name and gender complete; city required |
| onboarding-visibility@example.test | City selected; visibility review required |
| starting@example.test | Starting path; may browse but cannot join |
| reader@example.test | Join request pending in local assembly |
| female-reader@example.test | Experienced female reader; eligible to join |
| disagreed@example.test | One negative answer; excluded from people discovery |
| member@example.test | Local member; meeting access; cannot join elsewhere |
| declined@example.test | Declined local request; may request again |
| left@example.test | Left local assembly; may request again |
| pending-online@example.test | Online request pending |
| legacy-city@example.test | City label without coordinates; must select a city |
| applicant@example.test | Unverified leader; request two endorsements |
| applicant-pending@example.test | Two pending endorsements |
| applicant-one@example.test | One accepted and one pending endorsement |
| applicant-declined@example.test | Declined endorsement; support required |
| leader-one@example.test | Verified local leader with members and requests |
| leader-two@example.test | Verified online leader with requests |
| leader-create@example.test | Verified leader without an assembly; can create |
| nearby-hidden@example.test | Jerusalem; hidden from people discovery |
| nearby-visible@example.test | Jerusalem; discoverable name and city only |
| nearby-contact@example.test | Jerusalem; discoverable with synthetic Telegram contact |

Invitation code: **1234567** (seven digits, 100 uses, thirty-day fixture expiry).
Invalid-code fixtures: **7654321** expired, **7654322** revoked, **7654323** exhausted.
Only `nearby-visible` and `nearby-contact` start discoverable; the latter explicitly
shares a synthetic Telegram identifier. All other accounts start hidden.
Two independent verified leaders can
endorse the applicant; discovery choices must remain explicit. Use separate
browser sessions or sign out to switch accounts. Native credentials use
SecureStore; browser sessions intentionally end on full reload. After fixture
reset, sign out/stale-session recovery and sign in again.

## Simulated integrations

For live commentary, set `OPENROUTER_API_KEY` and a full `OPENROUTER_MODEL` ID
in the server environment, then restart `bun run dev`. In development these
settings override simulated AI and personal provider connections, without
consuming the free consultation quota. The banner reports **live AI via
OpenRouter**; other sandbox integrations remain active. Clear either value
and restart to exercise the simulation and quota cases below. The API key
stays on the server and the local env file is Git-ignored.

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
- Calendar: the API invokes Bore logic; clients calculate no calendar rules.
  Real public INMS reports are imported by default and refreshed every 30 minutes.
  Explicit synthetic scenarios remain labeled by provenance and the sandbox
  banner; unresolved Aviv remains explicit in all modes.

From `server/`, select a scenario:

```sh
bun run sandbox:calendar confirmed
bun run sandbox:calendar pending
bun run sandbox:calendar live
```

`confirmed` creates synthetic qualifying evidence four days before today;
`pending` shows a pending calendar while preserving the imported real observations.
`live` restores the real calendar and refreshes the public feed. These scenarios
do not overwrite real evidence. Check source links and next-sunset time in the UI;
reload/reopen the calendar to verify the selected city stays on the device.

## Reset and stop

From `server/`:

```sh
bun run sandbox:reset
```

Stop the API with Ctrl+C. That leaves PostgreSQL running. Reset clears the
sandbox rows the seed owns and writes them again. Select a calendar scenario
again after reset. Rate limits still apply; wait for their window if repeated
sign-in attempts are throttled. Sandbox mail is under `server/tmp/sandbox-mail/`.
Do not share runtime logs or inbox links. No private corpus is required.

## Broader product acceptance checklist

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
`DAVAR_VNEXT_ITERATION_REPORT.md`. Assemblies QA evidence and remaining platform limits are recorded in
[ASSEMBLIES_QA.md](../qa/ASSEMBLIES_QA.md). Other product acceptance items
remain separate. Live Google/Apple/Facebook/Telegram/X, external AI/email delivery,
production imports and release QA still need their own credentials and review.
