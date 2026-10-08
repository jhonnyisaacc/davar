# Development runtime

## Context

Rails development reloads code, shows full error reports, raises when migrations are pending, and logs queries and jobs more verbosely than hosted environments. A first port recreated the pending-migration boot check, the development error body (`name`, `message`, `stack`), SQL debug logs, and extra development job lines. Bun already reloads with `--watch`.

## Decision

Dropped the pending-migration boot check, the development error shape, the query logs, and the extra job lines. `bun run dev` is `bun --watch ./src/index.ts`. `bun run start` does not watch. Developers apply migrations with `bun run db:migrate`. Unhandled errors stay `{ error: { code: "internal_error" } }` in every environment. No new package.

## Alternatives

Keep the pending-migration response. That copies the Rails boot sequence. A developer runs `bun run db:migrate`.

Keep the development error body and query logs. Those are the Rails development log and error page. The request log already records the method and route without bound parameters.

Add a reload package. Bun's `--watch` already reloads.

## Evidence

`cd server && bun test tests/developmentRuntime.test.ts` checks that `dev` uses `--watch` and `start` does not.

## How to undo

Remove `--watch` from `server/package.json` `dev`. Delete `server/tests/developmentRuntime.test.ts` and this file.

## Status

Accepted for checklist row 3. The Rails development mode is dropped on this branch. `bun --watch` stays.
