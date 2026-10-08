# Development dotenv

## Context

Rails loads dotenv only in development, in the order `.env.development.local`, `.env.local`, `.env.development`, then `.env`. A first port recreated that file list with `--env-file` and used `--no-env-file` on `bun run start` so hosted boot would skip dotenv. Bun already loads `.env`.

## Decision

Dropped the recreated load order and the hosted `--no-env-file` port. `bun run dev` and `bun run start` are `bun ./src/index.ts` on this branch. Bun loads `.env`. An exported variable wins. The server does not pass `--env-file` or `--no-env-file`. No new package.

## Alternatives

Keep the four-file list. That copies the Rails mechanism.

Keep `--no-env-file` on `start`. That is the hosted half of the same port. Hosted processes already receive variables in the environment, and Bun's own `.env` loading is the runtime's behavior for both commands.

Add a dotenv dependency. Bun already loads `.env`.

## Evidence

`cd server && bun test tests/dotenv.test.ts` checks that `dev` and `start` omit the file flags, that both load `.env`, and that an export wins.

## How to undo

Restore `dev` and `start` in `server/package.json` to `bun --env-file=.env ./src/index.ts`. Restore the `server/.env.example` header and the environment paragraph in `server/README.md`. Remove this record and `server/tests/dotenv.test.ts`. The `.env.development.local` gitignore line can stay; it only keeps a local file uncommitted.

## Status

Accepted for checklist rows 2 and 12. The Rails dotenv port is dropped on this branch.
