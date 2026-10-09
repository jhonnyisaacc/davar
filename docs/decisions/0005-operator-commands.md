# Operator invitation and leader verification

## Context

Rails `davar:issue_invitation` prints a random 7-digit code and stores its digest with a 30-day expiry and 100 uses. `davar:verify_leader` loads `USER_ID` and sets `leader_verified` only when that user has completed onboarding, `gender` is `male`, and `experience` is `leader`. The endorsement API can also set the flag after two accepted endorsements. Checklist rows 51 and 52 had no Hono command.

## Decision

`bun run operator:issue-invitation` and `bun run operator:verify-leader` are operator commands. They are not HTTP routes.

The invitation command draws an integer in `0...10**7`, prints it zero-padded to 7 digits, and stores `accessCodeDigest` of that string with `max_uses` 100 and `expires_at` 30 days of 86400 seconds. A missing `USER_ID` fails with `USER_ID is required`. A missing or non-uuid id fails with `Couldn't find User with 'id'=...`. An ineligible user fails with `Eligible male leader onboarding required` and the flag stays false. An eligible user gets `leader_verified` set. The endorsement routes are unchanged.

## Alternatives

Add an admin HTTP route. That is a new permission surface.

Set the flag by accepting endorsements. That replaces the operator command and changes who can verify a leader.

Print a fixed invitation code. The rake task draws a new code on each run.

## Evidence

`cd server && bun test tests/operators.test.ts` covers the padded code, the 30-day expiry, 100 uses, the printed command, the eligible male leader, a reader, a female leader, incomplete onboarding, a missing user, a missing `USER_ID`, and that no endorsement row is written.

## How to undo

Remove `operator:issue-invitation` and `operator:verify-leader` from `server/package.json`, and delete `server/src/services/operators.ts`, `server/src/jobs/issue-invitation.ts`, `server/src/jobs/verify-leader.ts`, and `server/tests/operators.test.ts`.

## Status

Accepted for checklist rows 51 and 52.
