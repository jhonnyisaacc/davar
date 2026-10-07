---
name: verify-davar
description: "Drive Davar's React web reader over Chrome DevTools, the Hono API over HTTP, and the Python knowledge worker in a terminal session. Use when proving a Davar change, checking that an instance is worth driving, or capturing verification evidence. Mobile drive is unimplemented."
---

# Verify Davar

Primary surface is the React web app (scripture reader). The Hono API, the Python knowledge worker, and the Expo app are separate control CLIs. Drive only an instance this skill started. One instance per app lives under `/tmp/davar-verify` unless `DAVAR_VERIFY_ROOT` points somewhere else. A second web instance also needs its own `DAVAR_WEB_PORT` and `DAVAR_WEB_CDP_PORT`.

Run every command from the repository root. The control CLIs print `status ok` or `status fail` and short `key value` lines.

## Launch

Web (documented `bun run dev` in `web/`, then headless Chrome):

```bash
bun scripts/control/web.ts start
```

Ready when the command prints `status ok` with `url http://127.0.0.1:5173` and a `cdp` port (9222 unless `DAVAR_WEB_CDP_PORT` is set). Chrome opens at 390 by 844 so the narrow-layout verse buttons are on screen. The dev server log is `/tmp/davar-verify/web/server.log`. If `web/.env` is missing, start copies `web/.env.example` and reset deletes that copy.

Hono API (documented `bun --env-file=.env ./src/index.ts` in `server/`):

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/davar_server_test
bun scripts/control/server.ts start
```

Ready when `status ok` and `GET /up` would return `{"status":"ok"}`. Start fails with `database-url-missing` when `DATABASE_URL` is unset. Port 3000 unless `DAVAR_SERVER_PORT` is set.

Python knowledge worker (no long-running server; start opens a bash session, each drive runs inside it):

```bash
bun scripts/control/worker.ts start
```

Ready when `status ok` names the tmux session `davar-verify-worker` (override with `DAVAR_WORKER_SESSION`). Requires `python3` with `jsonschema` and `referencing` importable.

Expo packager, only when `mobile/node_modules/expo` is already installed:

```bash
bun scripts/control/mobile.ts start
```

Ready when Metro listens on 8081. This does not drive the app.

## Doctor

Run doctor before driving. It is read-only.

```bash
bun scripts/control/web.ts doctor
bun scripts/control/server.ts doctor
bun scripts/control/worker.ts doctor
bun scripts/control/mobile.ts doctor
```

Web doctor requires the dev server pid and the Chrome pid from this run, the listen ports owned by those processes, and Chrome's `/json/version` answering. Server doctor requires the same for port 3000 and `GET /up` body `{"status":"ok"}`. Worker doctor requires tmux, `python3`, the schema imports, and the session. Mobile doctor reads `mobile/app.json` and always reports `drive unimplemented` and `reason maestro`.

`reason not-running` means there is nothing to drive yet. `reason port-not-ours` or `port-busy` means another process already has the port: do not take it over.

## Drive

Web uses Chrome DevTools against the page this run launched. Prefer the accessible name (the English `aria-label` or the button text).

```bash
bun scripts/control/web.ts drive open /verse/Genesis/1/1
bun scripts/control/web.ts drive click "Next verse"
bun scripts/control/web.ts drive click "Settings"
bun scripts/control/web.ts drive click "Text Sources"
```

A cold load of `/settings` can be replaced by the saved verse route. Open the reader, then click `Settings`.

`drive open` waits until the URL contains the path and the page has text. `drive click` clicks a `button`, `a`, or `[role=button]` whose accessible name or text is an exact match.

Hono drive is HTTP GET only:

```bash
bun scripts/control/server.ts drive get /up
```

The knowledge worker drive types one of two commands into the tmux session: `python3 -m scripts.knowledge validate` or `check`, with `PYTHONPATH=.` from the repo root.

```bash
bun scripts/control/worker.ts drive validate
bun scripts/control/worker.ts drive check
```

`validate` checks the committed pilot output. `check` also rebuilds into a temp directory and compares. Neither writes product data.

Mobile drive is not implemented. Maestro would be a new runtime dependency, which this repo does not add.

```bash
bun scripts/control/mobile.ts drive
```

That exits `status fail` and `reason maestro-unimplemented`.

Read the feature map before choosing a path. A proof that uses one entry point does not cover the others listed for that feature.

## Evidence

Capture the action and the resulting state. Web evidence is a PNG screenshot plus `state.txt` (url, title, visible text) and the transcript of drive commands. Server evidence is the response body and status. Worker evidence is the terminal output and exit code. Artifacts go under `artifacts/verify/<app>/` and are gitignored.

```bash
bun scripts/control/web.ts state
bun scripts/control/web.ts evidence
bun scripts/control/server.ts state
bun scripts/control/server.ts evidence
bun scripts/control/worker.ts state
bun scripts/control/worker.ts evidence
```

Mobile has `state` (version, bundle id, Metro up or down). `evidence` fails with `maestro-unimplemented` because there is no UI capture without Maestro.

Do not treat a test-only endpoint or an in-memory setter as proof. `/up` is the real health route. Scripture proof is the loaded reader, not a direct call to the static JSON file.

## Cleanup

Stop kills only the pids or the tmux session this run recorded. Reset does that and deletes `/tmp/davar-verify/<app>`, including a `.env` that start created from the example file. Reset never deletes `artifacts/verify/`.

```bash
bun scripts/control/web.ts stop
bun scripts/control/web.ts reset
bun scripts/control/server.ts reset
bun scripts/control/worker.ts reset
bun scripts/control/mobile.ts reset
```

After reset, the evidence directory from the last `evidence` command must still be on disk.

## Helpers

Control CLIs, from the repository root:

- `bun scripts/control/web.ts` — React web, Chrome DevTools
- `bun scripts/control/server.ts` — Hono API, HTTP
- `bun scripts/control/worker.ts` — `python -m scripts.knowledge` in tmux
- `bun scripts/control/mobile.ts` — Expo doctor, state, and reset; drive unimplemented

Each accepts only `doctor`, `start`, `stop`, `drive`, `state`, `evidence`, and `reset`.

Local check, same commands as Web CI, Mobile CI, Server CI, and Python CI:

```bash
./scripts/check
```

Web runs lint, `bun x tsc --noEmit`, the static-data loader tests, `bun run build`, and `bun test`. Mobile runs `bun install --frozen-lockfile`, lint, test, and typecheck. Server runs typecheck, `bun run db:migrate`, and `bun test` against `DATABASE_URL` (default `postgresql://postgres:postgres@127.0.0.1:5432/davar_server_test`). Python runs `pytest` on `tests/test_hutter_morphology.py` and `tests/test_hutter_attested_morphology.py`. The script does not drop or loosen any of those steps. Server CI's Postgres service has to be running locally or the server section fails.

Feature recipes: `.cursor/skills/verify-davar/feature-map.md` and `.cursor/skills/verify-davar/features/`.

Keep the map honest with `/maintain-verification-skill` as features change.
