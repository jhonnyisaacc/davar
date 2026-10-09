# Sandbox fixture personas

## Context

Rails `DevelopmentFixtures` seeds 25 `@example.test` personas, membership rows for requested, member, declined, left, and the pending online request, endorsement rows for requested, accepted, and declined, and returns those scenario labels from `seed!`. It also seeds invitation `1234567` (open, 30 days, 100 uses) and invalid codes `7654321` (expired), `7654322` (revoked), and `7654323` (exhausted). Hono already seeded `DAVAR-LOCAL` as its open local invitation.

## Decision

Seed the Rails personas, membership rows, endorsement rows, and scenario labels from the existing development `seedFixtures` path. `bun run sandbox:seed` prints that result. Hono keeps `DAVAR-LOCAL` and also seeds the Rails codes: valid `1234567`, expired `7654321`, revoked `7654322`, and exhausted `7654323`. A later seed leaves an existing invalid code unchanged. Reset deletes those fixture codes and seeds them again, including `DAVAR-LOCAL`.

## Alternatives

Replace `DAVAR-LOCAL` with `1234567`. Hono keeps the local code and gains the Rails codes beside it.

## Evidence

`cd server && bun test tests/sandbox.test.ts` asserts the 25 accounts, a repeat seed that keeps the same users and does not rewrite a changed display name, the membership states, the endorsement states, the scenario labels, and the stored state of `DAVAR-LOCAL`, `1234567`, `7654321`, `7654322`, and `7654323`.

## How to undo

Revert the persona, membership, endorsement, label, and invitation changes in `server/src/services/fixtures.ts` and `server/tests/sandbox.test.ts`.

## Status

Accepted for checklist rows 25, 26, 28, and 29.
