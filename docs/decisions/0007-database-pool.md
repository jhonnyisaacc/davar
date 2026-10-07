# Database pool follows RAILS_MAX_THREADS

## Context

Rails sets the Postgres pool in `api/config/database.yml` from `RAILS_MAX_THREADS`, and the fetch default is 5. Puma reads the same variable with a different unset default of 3. Hono opened every client with `max: 10` in `server/src/db/client.ts`, so the Rails setting did not apply. Checklist row 14.

## Decision

`createDb` sets the postgres.js pool `max` from `RAILS_MAX_THREADS`. There is no second pool variable. A missing value, a blank value, a non-integer, or a non-positive integer uses 5. A positive integer, including surrounding whitespace, is the pool size. The migration client stays at one connection.

## Alternatives

Keep `max: 10`. That leaves `RAILS_MAX_THREADS` ignored.

Add a Hono-only variable such as `DB_POOL`. That is a second knob beside the Rails name.

Default to 3 when the variable is unset. That matches Puma's thread default, not the pool in `database.yml`.

Refuse to boot on an invalid value. Rails may reject a bad pool string. This server keeps the documented default of 5 instead.

## Evidence

`cd server && bun test tests/dbPool.test.ts` covers an unset variable, a positive integer, a trimmed integer, and invalid or non-positive values, and checks that `createDb` passes that size as `max`.

## How to undo

Revert `server/src/db/client.ts`, delete `server/tests/dbPool.test.ts`, and delete this file.

## Status

Accepted for checklist row 14.
