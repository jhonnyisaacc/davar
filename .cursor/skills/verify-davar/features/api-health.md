# Product API health

The Hono server reports whether the API process is up. Clients keep calling `/api/v1` on this same server; health is the unauthenticated check.

## Sub-features

- `health-up` returns the health document from `GET /up`.

## How to get to it (user POV)

- Request `GET /up` on the API origin (`http://127.0.0.1:3000` in local development).

## Driving it with the server control CLI

Preconditions:

- `DATABASE_URL` is set and `bun scripts/control/server.ts doctor` prints `status ok` with body `{"status":"ok"}`.

- **Health.** Request the health route. Run `bun scripts/control/server.ts drive get /up`. The command prints `http 200` and `body {"status":"ok"}`.
- **Proof.** Run `bun scripts/control/server.ts evidence`. `artifacts/verify/server/` contains `response.txt` and `http.txt`.

## Gotchas

- Start refuses to launch without `DATABASE_URL`. `/up` does not read the database, but the process will not boot without the variable.
- Do not point this CLI at a server it did not start. Doctor fails with `port-not-ours` when port 3000 belongs to another process.
- Product routes under `/api/v1` need a migrated database and, for account routes, a session. A passing `/up` does not prove those routes.
