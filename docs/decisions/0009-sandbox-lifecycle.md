# Sandbox setup, start, and stop

## Context

Rails `api/bin/dev-sandbox setup` installs gems, web, and mobile, creates a Python venv, prepares `davar_v2_sandbox`, seeds fixtures, syncs the calendar, and builds web. `start` checks PostgreSQL and ports 3000, 5173, 5174, and 8081, then starts the API, web, and mobile. `stop` stops that process group and leaves PostgreSQL running. Hono had no launcher for those three commands. Checklist rows 32, 33, and 36. Row 34 (`ios`) is a separate command.

## Decision

`server/bin/dev-sandbox` implements `setup`, `start`, and `stop`.

`setup` installs web and mobile with `bun install --frozen-lockfile`, creates `server/tmp/sandbox/venv` when it is missing, and installs `api/requirements.txt` into that venv. It then runs `server/bin/setup --skip-server` with `DATABASE_URL` pointed at `davar_v2_sandbox` on `127.0.0.1` and the port from `PGPORT` (default 5432). The database user and password are the local compose credentials. Setup then runs `bun run sandbox:seed` and `bun run jobs:calendar`, and builds web with `bun ./build.ts`. It does not install Ruby gems. `--skip-server` keeps setup from starting the API. A real run skips creating the venv when its Python binary is already there, and still installs the requirements.

`start` checks that PostgreSQL accepts a connection, that `mobile/node_modules` exists, and that 3000, 5173, 5174, and 8081 are free. It then starts the API with `bun run dev` (`PORT=3000`), web with `bun run dev`, and mobile with `bun run start --dev-client --port 8081`. Each service is its own process group, with `CI=1`, and the pid plus start time are written to `server/tmp/sandbox/processes.json`. Web and mobile do not inherit `PORT`, so web stays on 5173 and 5174.

`stop` signals only those recorded process groups whose start time still matches. It does not signal pid 1, the current process, a pid whose start time changed, or PostgreSQL. `--dry-run` prints the checks and commands and does not install, connect, spawn, or signal.

`jobs:calendar` remains a no-op without `IMPORT_FILE`. Forcing an INMS fetch is checklist row 46. `ios`, `reset`, and `calendar` are not subcommands of this launcher. Staging and production are refused before any step.

## Alternatives

Call `bundle install` and `bin/rails`. That installs Ruby gems.

Teach `server/bin/setup` about the sandbox database. The launcher calls the existing command with `--skip-server` and the sandbox `DATABASE_URL`.

Use the Rails URL with no database user. The compose Postgres expects the local user already named in `server/compose.yml`.

Start the API inside setup. `start` is the command that starts it, so setup passes `--skip-server`.

Stop whatever is listening on the app ports. That can stop PostgreSQL or another checkout. The process file plus the start time avoids that.

Make `jobs:calendar` fetch the public INMS feed during setup. That force import is checklist row 46.

Implement `ios` here. That command needs Expo and a simulator.

## Evidence

`cd server && bun test tests/dev-sandbox.test.ts` covers the setup and start dry-runs, a stop dry-run that does not signal, a stop that signals only the matching process group, and the unchanged `dev`, `start`, `setup`, and compose database. The test does not boot PostgreSQL, web, or mobile.

## How to undo

Delete `server/bin/dev-sandbox`, `server/src/dev-sandbox.ts`, `server/tests/dev-sandbox.test.ts`, and this file. Remove the `server/tmp/` gitignore line and the `bin/dev-sandbox` bullets in `server/README.md`.

## Status

Accepted for checklist rows 32, 33, and 36.
