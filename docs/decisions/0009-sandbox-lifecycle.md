# Sandbox seed and reset

## Context

Rails `api/bin/dev-sandbox` installs gems, prepares a sandbox database, seeds fixtures, starts the API, web, and mobile, and stops that process group. Hono already resets the sandbox with `bun run sandbox:seed` and `bun run sandbox:reset`. A first port added `api/bin/dev-sandbox` as a process manager for setup, start, and stop. Checklist rows 32, 33, and 36. Row 34 (`ios`) is a separate command and is not added here.

## Decision

Dropped the process manager: `api/bin/dev-sandbox` and `api/src/dev-sandbox.ts` are gone. The resettable sandbox outcome stays the Bun scripts `bun run sandbox:seed` and `bun run sandbox:reset`. There is no iOS command. `jobs:calendar` remains a no-op without `IMPORT_FILE`. Forcing an INMS fetch is checklist row 46. `api/tmp/` stays ignored so the local mailbox is not committed.

Old-stack names found in `api/` on this branch, outside that launcher, are dropped from this package's own files: the unique-violation comment, the encryption paragraphs that named the previous encryption library, and the Bore copy note that ended on the old stack. Bore stays at `api/lib/bore`. The `legacy-names` check scans `api/`.

## Alternatives

Keep the process manager and rename the file. That still recreates the Rails launcher.

Teach `bun run setup` to seed the sandbox. Seed and reset already have their own scripts.

Implement `ios` here. That command needs Expo and a simulator.

Make `jobs:calendar` fetch the public INMS feed. That force import is checklist row 46.

## Evidence

`cd api && bun test tests/dev-sandbox.test.ts` checks that seed and reset are Bun scripts and that the launcher file is gone. It does not boot PostgreSQL, web, or mobile. `bash scripts/legacy-names.sh` prints `legacy-names: 0`.

## How to undo

Restore `api/bin/dev-sandbox`, `api/src/dev-sandbox.ts`, and the previous `api/tests/dev-sandbox.test.ts`. Restore the launcher bullets in `api/README.md`.

## Status

Accepted for checklist rows 32, 33, and 36. The process manager is dropped on this branch.
