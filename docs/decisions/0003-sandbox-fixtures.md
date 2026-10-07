# Sandbox fixture personas

## Context

Rails `DevelopmentFixtures` seeds 25 `@example.test` personas, membership rows for requested, member, declined, left, and the pending online request, endorsement rows for requested, accepted, and declined, and returns those scenario labels from `seed!`. Hono seeded six personas, one requested membership, and no labels. Hono's invitation code is `DAVAR-LOCAL`. Rails uses `1234567`, plus expired `7654321`, revoked `7654322`, and exhausted `7654323`.

## Decision

Seed the Rails personas, membership rows, and endorsement rows from the existing development `seedFixtures` path, and return `assemblies_scenarios` on that result. `bun run sandbox:seed` prints the result, which is the seed path. `DAVAR-LOCAL` stays the invitation code. The Rails invitation codes are not added here.

## Alternatives

Drop `DAVAR-LOCAL` and seed the Rails codes. This change leaves `DAVAR-LOCAL` in place because it is absent from Rails and the brief says to stop rather than delete it. Seeding the Rails codes beside `DAVAR-LOCAL` would keep a code Rails does not define.

## Evidence

`cd server && bun test tests/sandbox.test.ts` asserts the 25 accounts, a repeat seed that keeps the same users and does not rewrite a changed display name, the membership states, the endorsement states, and the scenario labels on the seed result.

## How to undo

Revert the persona, membership, endorsement, and label changes in `server/src/services/fixtures.ts` and `server/tests/sandbox.test.ts`. The invitation code is unchanged.

## Status

Accepted for checklist rows 25, 28, and 29. Row 26 stays open.
