# Product API health

The Hono server reports whether the API process is up. Clients call `/api/v1` on the same server, and `/up` is the unauthenticated health check.

## Sub-features

- `health-up` returns the health document from `GET /up`.

## How to get to it (user POV)

- Request `GET /up` on the API origin (`http://127.0.0.1:3000` in local development).

## Driving it with scripts/control

Preconditions:

- `DATABASE_URL` is set, `bun scripts/control/api.ts start` printed `status ok`, and `bun scripts/control/api.ts doctor` prints `status ok`.

- **Health.** Run `bun scripts/control/api.ts drive get /up`. The command prints `http 200` and `body {"status":"ok"}`.
- **Proof.** Run `bun scripts/control/api.ts evidence`. The folder under `artifacts/verify/api/` contains `response.txt` and `http.txt`.

## Gotchas

- `start` refuses to launch without `DATABASE_URL`. `/up` doesn't read the database, but the process won't boot without the variable.
- Don't point this CLI at a server it didn't start. `doctor` fails with `port-not-ours` when port 3000 belongs to another process.
- Product routes under `/api/v1` need a migrated database and, for account routes, a session. A passing `/up` doesn't prove those routes.
