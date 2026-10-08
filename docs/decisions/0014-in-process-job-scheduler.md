# In-process Bun job scheduler

## Context

The Hono API needs a schedule for the calendar sync, consultation recovery, and Telegram outbox. Rails runs the calendar sync every 30 minutes inside Puma and tells operators to run consultation recovery and notification delivery every minute from outside the process. The hourly purge only deletes finished Solid Queue rows. Hono already had the three job bodies behind `bun run jobs:*`. Nothing was calling them on a timer.

The Hono server does not deploy on Cloudflare Workers. `server/src/index.ts` is a Bun process (`port` and `fetch`). `web/wrangler.jsonc` is a Pages project for the frontend (`pages_build_output_dir`, the TS2009 R2 binding). There is no Wrangler config under `server/`. `.github/workflows/backend-deploy.yml` is a manual no-op. Older notes that mention Render describe a previous backend, not this process.

## Decision

Use one in-process Bun scheduler. Do not add Cloudflare Cron Triggers.

`server/src/scheduler.ts` keeps the last run of each job in memory and ticks once a minute. A tick calls only the jobs that are due. The scheduled functions are `syncCalendarObservations` (every 30 minutes, live feed, skipped when the feed is not due), `recoverConsultationsJob` (every minute), and `deliverNotifications` (every minute). `NODE_ENV=test` does not start the timer.

A calendar tick that returns before the feed fetch starts does not move that job's clock. The clock moves when the fetch starts. A restart during the 30-minute guard retries on the next minute instead of waiting out another full interval.

The control CLI runs those same functions: `bun scripts/control/index.ts job <name>` and `bun scripts/control/index.ts job tick`. `job tick` is one tick, not a loop. `bun run jobs:calendar` stays the reviewed-file import and still skips without `IMPORT_FILE`.

There is no queue table, so the hourly finished-job purge has nothing to delete. It is not ported.

## Alternatives

Cloudflare Cron Triggers. That fits a Worker. This API is a long-running Bun process, so a cron trigger would not run here.

An external cron that shells out to `bun run jobs:*`, and no in-process timer. That splits one process into a second supervisor. The functions stay callable from the CLI either way.

Both a cron trigger and an in-process timer. Two schedulers would run the same jobs twice.

A durable queue and a worker process. The jobs are already idempotent and short. A queue table is a second system with nothing left to store.

## Evidence

`cd server && bun test tests/scheduler.test.ts` drives a fake clock and one recorded tick. It does not start the timer.

## How to undo

Remove the `startScheduler` call from `server/src/index.ts`. Delete `server/src/scheduler.ts`, `server/src/jobs/functions.ts`, `server/tests/scheduler.test.ts`, and this file. Restore the previous `server/src/cli/control.ts`, `server/src/jobs/recover.ts`, `server/src/jobs/notify.ts`, and the jobs section of `server/README.md`.

## Status

Accepted. The API process owns one scheduler.
