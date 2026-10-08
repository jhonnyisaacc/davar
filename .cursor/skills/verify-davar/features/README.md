# Davar verification map

Read [feature-map.md](../feature-map.md) for the check command of each feature, then use the matching file below as the recipe.

## Baseline preconditions

- Web runs at `http://127.0.0.1:5173` with Chrome DevTools on port 9222, both started by `bun scripts/control/web.ts start`.
- The Hono API runs at `http://127.0.0.1:3000` only after `DATABASE_URL` is set and `bun scripts/control/server.ts start` prints `status ok`.
- The knowledge worker is the tmux session `davar-verify-worker` in this checkout.
- Python pipelines use `bun scripts/control/python.ts`. `drive help` and `drive fixture` do not write product data.
- Run `doctor` for that app and require the printed URL or session. Never drive a port this run does not own.
- One instance per app. A second web instance needs a different `DAVAR_VERIFY_ROOT`, `DAVAR_WEB_PORT`, and `DAVAR_WEB_CDP_PORT`.

## Driving conventions

- Start every recipe from a fresh `start` unless its preconditions say otherwise.
- Prefer accessible names over coordinates. English UI strings are the names below.
- Treat every command as literal.
- Web actions go through `bun scripts/control/web.ts`.
- HTTP actions go through `bun scripts/control/server.ts`.
- Worker actions go through `bun scripts/control/worker.ts`.
- Do not delete `artifacts/verify/` during cleanup.

## Proof and skip reporting

- Capture the command and the resulting `state` or response, not only a final screenshot.
- Web proof is the URL, the visible text, and `evidence` (PNG plus `state.txt`).
- HTTP proof is the status code and body.
- Worker proof is the exit code and the output tail.
- Record which feature file and entry point you used.
- If a path is unreachable, report the command and the unmet precondition. Do not mark it verified through a different path.
- Mobile UI driving is unimplemented until Maestro is approved. Say so instead of substituting the web reader.

## Features

- [Scripture reader](./read-verse.md) opens Genesis 1:1 and moves to the next verse.
- [Settings](./settings.md) opens the settings screen.
- [Text sources](./text-sources.md) opens the text-source list from settings.
- [Product API health](./api-health.md) reads `GET /up` from the Hono server.
- [Knowledge worker](./knowledge-worker.md) validates the committed knowledge pilot in a terminal session.
