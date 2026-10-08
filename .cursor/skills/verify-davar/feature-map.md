# Davar feature map

Five current features and the control command that checks each one. Recipes with entry points live in [features/](features/README.md). Add a feature when it is refactored.

Run commands from the repository root after the matching `start` and `doctor`.

## Scripture reader

Open Genesis 1:1 in the web reader and move to the next verse.

```bash
bun scripts/control/web.ts drive open /verse/Genesis/1/1
bun scripts/control/web.ts state
bun scripts/control/web.ts drive click "Next verse"
bun scripts/control/web.ts evidence
```

Pass: `state` URL contains `/verse/Genesis/1/1` and the visible text contains `Genesis`. After the click, the URL or the verse control shows the next verse. The screenshot in `artifacts/verify/web/` shows the same passage.

Mobile shows the same reader. `bun scripts/control/mobile.ts drive` is unimplemented (`maestro-unimplemented`). Use `doctor`, `state`, and `reset` only.

## Settings

Open the settings screen.

```bash
bun scripts/control/web.ts drive open /verse/Genesis/1/1
bun scripts/control/web.ts drive click "Settings"
bun scripts/control/web.ts state
```

Pass: the visible text contains `Dark theme`. The verse URL stays put; `Settings` opens the menu. A cold load of `/settings` is replaced by the saved verse route.

## Text sources

Open Text Sources from settings.

```bash
bun scripts/control/web.ts drive open /verse/Genesis/1/1
bun scripts/control/web.ts drive click "Settings"
bun scripts/control/web.ts drive click "Text Sources"
bun scripts/control/web.ts state
```

Pass: the URL contains `/sources` and the visible text contains `Text Sources`.

## Product API health

Ask the Hono server for its health document.

```bash
bun scripts/control/server.ts drive get /up
bun scripts/control/server.ts evidence
```

Pass: `http 200` and body `{"status":"ok"}`. The response file remains under `artifacts/verify/server/` after reset.

## Knowledge worker

Validate the committed knowledge pilot from the worker's terminal session.

```bash
bun scripts/control/worker.ts drive validate
bun scripts/control/worker.ts evidence
```

Pass: `exit 0` and the output tail contains `knowledge validate: OK`. `drive check` is the stronger rebuild comparison; use it when the change touches `scripts/knowledge` or `data/knowledge`.
