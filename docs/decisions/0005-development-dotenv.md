# Development dotenv and hosted boot

## Context

Rails loads dotenv only in development (`dotenv-rails` is in the development group). Shell variables win, then `.env.development.local`, `.env.local`, `.env.development`, and `.env`. Staging and production do not load Dotenv. They take variables from the host environment. Hono `dev` and `start` both ran `bun --env-file=.env`, so development never read `.env.development`, and hosted start always read `.env` when that file was present.

## Decision

`bun run dev` passes `--no-env-file` and then `--env-file` for `.env`, `.env.development`, `.env.local`, and `.env.development.local`, in that order. Bun gives the later file precedence, which matches the Rails order, and an exported variable still wins. `--no-env-file` keeps `NODE_ENV=production` from also reading `.env.production` during `dev`. Missing files are skipped.

`bun run start` is `bun --no-env-file ./src/index.ts`. Staging and production do not read dotenv files. No new package, hosted secret, or dashboard setting. Hosted processes already receive variables in the environment.

## Alternatives

Load only `.env.development`. That drops `.env`, which Rails still reads and which `server/.env.example` is copied to.

Add a dotenv dependency or a second parser. Bun's `--env-file` already matches the precedence and quote rules. A new dependency is out of scope.

Leave `start` on `--env-file=.env` and tell operators to delete the file. Rails does not read the file at all when it is present.

## Evidence

`cd server && bun test tests/dotenv.test.ts` checks that development loads `.env.development`, that an export wins, that the four development files keep Rails precedence, and that staging and production start ignore dotenv files including `.env`.

## How to undo

Restore `dev` and `start` in `server/package.json` to `bun --env-file=.env ./src/index.ts`. Restore the `server/.env.example` header, the environment paragraph in `server/README.md`, and the `.env.development.local` gitignore line. Remove this record and `server/tests/dotenv.test.ts`.

## Status

Accepted for checklist rows 2 and 12.
