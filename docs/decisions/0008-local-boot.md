# Local setup and Postgres 17

## Context

Rails `api/bin/setup` installs gems, runs `db:prepare`, runs `db:reset` when `--reset` is passed, clears logs and tempfiles, and starts `bin/dev` unless `--skip-server`. `api/compose.yml` is Postgres 17 for `davar_v2_development` on 127.0.0.1:5432 with local-only credentials. Hono had no setup command and no compose file. Checklist rows 22 and 23.

## Decision

`server/bin/setup` and `bun run setup` install server dependencies with `bun install --frozen-lockfile`, prepare the local database, optionally drop and recreate it, truncate `log/*.log`, and start `bun run dev` unless `--skip-server`. `--help` and `--dry-run` do not install, connect, or start the server. An unknown flag fails.

The database URL is `DATABASE_URL` when that variable is set. When it is unset or blank, the URL is the compose database `postgresql://davar:local-development-only@127.0.0.1:5432/davar_v2_development`. The host must be `localhost`, `127.0.0.1`, or `::1`. Any other host is refused before a connection. The database name must be a simple identifier, and the maintenance database `postgres` is refused. Staging and production are refused before a connection on a real run.

Prepare creates the database when it is missing, then runs the existing migrator. `--reset` runs after prepare: it terminates sessions, drops that database, creates it, and migrates again. Seeds and sandbox fixtures are not loaded.

Setup does not read `.env` and does not change the `dev` or `start` scripts. When it starts the server, it sets `DATABASE_URL` on that process to the URL it prepared, so a hosted value in `.env` cannot replace it. `server/compose.yml` is Postgres 17 bound to 127.0.0.1:5432. Setup does not start the container. `server/.env.example` uses the same local URL.

Log clearing truncates files in `server/log` whose names end in `.log`. A missing log directory is a no-op. `tmp/sandbox-mail` is left in place.

## Alternatives

Call `bundle install` and `bin/rails`. That installs Ruby gems.

Start the compose service from setup. The container stays stopped until someone starts it.

Read `.env.development` inside setup. That is the dotenv gap. `dev` and `start` stay as they are.

Delete `tmp/`. That would remove the development mailbox.

Accept any `DATABASE_URL`, including a hosted host. Setup could then drop a remote database.

## Evidence

`cd server && bun test tests/setup.test.ts` covers help, dry-run, a hosted URL refusal, log truncation, the compose file, and the unchanged `dev` and `start` scripts. It does not need a running database.

## How to undo

Delete `server/bin/setup`, `server/src/setup.ts`, `server/compose.yml`, `server/tests/setup.test.ts`, and this file. Remove the `setup` script from `server/package.json`. Restore the `DATABASE_URL` line in `server/.env.example` and the run section in `server/README.md`.

## Status

Accepted for checklist rows 22 and 23.
