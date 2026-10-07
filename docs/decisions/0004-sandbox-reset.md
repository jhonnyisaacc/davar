# Sandbox reset, calendar command, and development status

## Context

Rails `DevelopmentFixtures.reset!` deletes fixture-owned rows, clears the mailbox, sets `development_scenario` to `live`, and seeds again. Email auth attempts are removed only when the decrypted address is a fixture account or the attempt belongs to a fixture user. `api/bin/dev-sandbox calendar` accepts `live`, `pending`, and `confirmed`, defaults to `live`, and then runs `davar:sync_calendar`. `DevelopmentController#status` lists simulations and `commentary_provider` as `openrouter` or `simulation`. `ai` is omitted from simulations when development OpenRouter is on.

## Decision

Reset decrypts `provider = email` attempts and deletes a row only when the address is a fixture email. Attempts whose user is a fixture user are deleted with that user. Other email attempts stay. Reset then sets `development_scenario` to `live` and seeds again.

`bun run sandbox:calendar [live|pending|confirmed]` is the calendar command. No argument means `live`. `live` runs the existing calendar job after the scenario is stored. That job still skips when `IMPORT_FILE` is unset.

Development status uses `developmentOpenrouter`. When it is on, `commentary_provider` is `openrouter` and `ai` is left out of simulations. Otherwise `commentary_provider` is `simulation` and `ai` stays first.

## Alternatives

Default the calendar command to `pending`, matching the rake task's `SCENARIO` fallback. The command this row names is `dev-sandbox calendar`, which defaults to `live` and syncs.

Make `live` fetch the public INMS feed. That force import is checklist row 46. This command only runs the calendar job that already exists.

Keep deleting every `provider = email` attempt. Rails keeps attempts that are not fixture-owned. The stored email is sealed, so a plaintext `IN` list does not see fixture addresses.

## Evidence

`cd server && bun test tests/sandbox.test.ts` covers reset (kept auth attempt, deleted fixture attempt, scenario `live`, mailbox cleared), the three calendar scenarios plus the `live` sync skip, and the status payload with and without development OpenRouter.

## How to undo

Revert `server/src/services/fixtures.ts`, `server/src/jobs/sandbox-calendar.ts`, `server/src/http/routes/development.ts`, `server/package.json`, `server/README.md`, and `server/tests/sandbox.test.ts`.

## Status

Accepted for checklist rows 35, 37, and 39.
