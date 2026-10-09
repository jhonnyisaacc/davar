# Hosted SMTP password name

## Context

Rails hosted mail reads `SMTP_PASSWORD` in `api/config/environments/production.rb`. Hono `sendSignInMail` authenticated with `SMTP_PASS`. A first port accepted `SMTP_PASSWORD` as an alias so a Rails environment could supply the password. That name is the old stack's variable. It is not set by a deploy platform, a client, or any contract outside `api/`.

## Decision

Dropped the `SMTP_PASSWORD` alias. Hosted mail reads `SMTP_PASS` only. There is no shim. Auth is still attached only when `SMTP_USER` and `SMTP_PASS` are both present. A rejected send still throws. This server does not write the password to logs or into the error it raises. Host, port, and TLS settings stay as they are.

## Alternatives

Keep the alias. That leaves an old-stack name in the new server for a variable nothing outside `api/` requires.

Add a one-file shim with a removal issue. The stack-migration exception is for an external contract. This name does not have one.

## Evidence

`cd server && bun test tests/mailer.test.ts` covers `SMTP_PASS` authentication, a raised delivery error that does not print the password, and sandbox delivery that does not open an SMTP transport.

## How to undo

Revert `server/src/services/mailer.ts`, `server/tests/mailer.test.ts`, the SMTP lines in `server/.env.example` and `server/README.md`, and delete this file.

## Status

Accepted for checklist row 44. The alias drop is recorded on this branch.
