# Development runtime

## Context

Rails development reloads code, shows full error reports, raises on page load when migrations are pending, and logs queries and jobs more verbosely than staging or production. Hono served every environment the same way: `bun run dev` did not watch files, every unhandled error returned `internal_error` with no stack, boot ignored pending SQL files, and queries were not logged.

## Decision

`bun run dev` adds Bun's built-in `--watch`. The dotenv file list is unchanged. `bun run start` does not watch. No package was added. The dotenv probe removes `--watch` before it launches, because watch keeps the process up after the script exits. The script in `package.json` still contains `--watch`.

Development responses for unhandled errors include `name`, `message`, and `stack`, and still use `code: internal_error`. Staging, production, and test keep `{ error: { code: "internal_error" } }` with no stack. The `request_error` log stays the redacted line in every environment, including development, so bound parameters are not written to logs.

Development checks `schema_migrations` against `server/drizzle/*.sql` before listening and again on each request. A pending file, or a missing `schema_migrations` table, throws and the request returns `pending_migration` with the file list. Staging, production, and test do not check.

Development query logs are the SQL text from postgres.js `debug`, with placeholders rather than bound values. Test, staging, and production do not pass `debug`. Development job scripts for consultation recovery and Telegram delivery log one extra line with the job name and source file, then the same result line as hosted. Hosted result lines are unchanged.

## Alternatives

Add a reload package. Bun already watches.

Put the stack in the log as well as the response. The log line is the redaction boundary. The response is the error report.

Fail only the process, or only the request. Rails uses page load. The process also refuses to listen so `bun run dev` stops before it serves. `--watch` does not restart a process that exits, so a pending migration does not loop.

Annotate the query caller, or append Rails query-log tags to the SQL. The driver emits the query on the socket callback, after the application frame is gone. A call-site tracer would be new machinery. Tags would change the statement. Neither is done.

Change the calendar force-sync script. That command is a separate checklist row and was left as it is. In development its queries are still logged, because the database client turns `debug` on from `NODE_ENV`.

## Evidence

`cd server && bun test tests/developmentRuntime.test.ts` covers watch on `dev` only, development error bodies, redacted logs, pending migrations at load and on request, quiet hosted and test checks, query logs without parameters, and development job lines.

## How to undo

Remove `--watch` from `server/package.json` `dev`. Restore the previous `onError` body in `server/src/http/app.ts`. Stop calling `assertMigrationsApplied` from `server/src/index.ts`. Remove the development job lines from `server/src/jobs/recover.ts` and `server/src/jobs/notify.ts`. Drop `verboseQueryLogs` from `server/src/db/client.ts`.

## Status

Accepted for checklist row 3.
