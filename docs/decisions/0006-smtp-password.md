# Hosted SMTP password name

## Context

Rails hosted mail reads `SMTP_PASSWORD` in `api/config/environments/production.rb`. Hono `sendSignInMail` authenticated with `SMTP_PASS` only, so a Rails environment did not supply the password. Delivery already awaited `sendMail`, and a rejection already propagated. Host, port, and TLS settings stay as they are.

## Decision

A non-empty `SMTP_PASSWORD` is the SMTP auth password. When `SMTP_PASSWORD` is missing or empty, `SMTP_PASS` is used, so an existing Hono environment keeps working. When both are non-empty, `SMTP_PASSWORD` wins. Auth is still attached only when `SMTP_USER` and a password are both present. A rejected send still throws. This server does not write the password to logs or into the error it raises.

## Alternatives

Read only `SMTP_PASSWORD`. That matches the Rails name and stops authenticating an environment that sets `SMTP_PASS` alone.

Read only `SMTP_PASS`. That leaves the Rails variable ignored.

Prefer `SMTP_PASS` when both are set. That disagrees with the Rails name.

## Evidence

`cd server && bun test tests/mailer.test.ts` covers `SMTP_PASSWORD`, `SMTP_PASS` alone, both set, an empty `SMTP_PASSWORD` falling back to `SMTP_PASS`, a raised delivery error, and that the password is not printed.

## How to undo

Revert `server/src/services/mailer.ts`, `server/tests/mailer.test.ts`, the SMTP lines in `server/.env.example` and `server/README.md`, and delete this file.

## Status

Accepted for checklist row 44.
