# Database pool size

## Context

Rails sets the Postgres pool in `api/config/database.yml` from `RAILS_MAX_THREADS`, and the fetch default is 5. Puma reads the same variable with a different unset default of 3. Hono opened every client with `max: 10`. A first port read `RAILS_MAX_THREADS` so the Rails setting would apply. That name belongs to the old process model. Nothing outside `api/` requires it.

## Decision

Dropped `RAILS_MAX_THREADS`. `createDb` sets the postgres.js pool `max` from `DATABASE_POOL_SIZE`. There is no Rails env name and no shim. A missing value, a blank value, a non-integer, or a non-positive integer uses 5. A positive integer, including surrounding whitespace, is the pool size. The migration client stays at one connection.

## Alternatives

Keep `max: 10`. That ignores an operator setting for the pool.

Keep reading `RAILS_MAX_THREADS`. That leaves an old-stack name in the new server.

Read both names. That is a shim. There is no external contract that needs the Rails name.

Default to 3 when the variable is unset. That matches Puma's thread default, not the pool size operators already expect, which is 5.

## Evidence

`cd server && bun test tests/dbPool.test.ts` covers an unset variable, a positive integer, a trimmed integer, and invalid or non-positive values, and checks that `createDb` passes that size as `max`.

## How to undo

Revert `server/src/db/client.ts`, delete `server/tests/dbPool.test.ts`, and delete this file. Remove the `DATABASE_POOL_SIZE` lines from `server/README.md` and `server/.env.example`.

## Status

Accepted for checklist row 14. The Rails env name is dropped on this branch.
