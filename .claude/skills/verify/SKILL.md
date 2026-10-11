---
name: verify
description: Drive the real Davar web app (Bun dev server + headless Chromium over CDP) to prove a change works the way a reader sees it. Use after any change under web/ or shared/ that a user can see, for bug reproduction on the web surface, and whenever a playbook asks for the driver skill. Mobile, server, and worker have sibling harnesses in scripts/control/.
---

# Verify Davar web

The primary surface is the web reader in `web/`. Drive it with the repo's own harness, `scripts/control/web.ts`. It starts the dev server and a headless Chromium on a debug port, then opens routes, clicks controls, and captures evidence. Every command prints `key value` lines and starts with `status ok` or `status fail` plus a `reason`, so act on the `reason` instead of guessing.

Run every command from the repository root.

## Launch

```bash
CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" bun scripts/control/web.ts start
```

- The harness defaults to `google-chrome`, which this Mac does not have. Any Chromium build works through `CHROME_PATH`.
- `start` runs `bun run dev` in `web/` (gateway on `5173`, hot HTML on `5174`) and then the browser with CDP on `9222`. The browser opens at a phone-sized 390x844 window.
- It is ready when it prints `status ok` with `url http://127.0.0.1:5173`. It waits on its own; don't poll. The first run can take minutes while `ensure-static-data` builds `/data`. Give the command a 10-minute timeout.
- If `web/.env` is missing, `start` copies `web/.env.example` and records that, so `reset` can remove it later.
- `start` refuses with `already-running`, `port-busy`, `html-port-busy`, or `cdp-busy`. Never stop someone else's process to free a port. Run `doctor`. If the instance is yours, reuse it. If it isn't, use an isolated instance (see below).

**Isolated second instance.** Run state lives in `$DAVAR_VERIFY_ROOT/web` (default `/tmp/davar-verify/web`). To run beside another instance, give every command the same environment:

```bash
export DAVAR_VERIFY_ROOT=/tmp/davar-verify-b DAVAR_WEB_PORT=5273 DAVAR_WEB_CDP_PORT=9322
```

`DAVAR_WEB_PORT + 1` is the hot HTML port, so leave it free.

## Doctor

```bash
bun scripts/control/web.ts doctor
```

This is read-only. It checks that the recorded server and browser processes are alive, that they own the app and CDP ports, and that CDP answers. Run it first whenever anything looks off. `not-running` means start a new instance. `port-not-ours` or `cdp-not-ours` means another process holds the port, so don't drive it.

## Drive

```bash
bun scripts/control/web.ts drive open /verse/Genesis/1/1
bun scripts/control/web.ts drive click Next verse
bun scripts/control/web.ts state
```

- `drive open <path>` navigates to a same-origin path and waits up to 45 s for the URL to match and the body to have text. It prints the URL and the first 500 characters of page text.
- `drive click <name>` clicks the first `button`, `a`, or `[role=button]` whose `aria-label`, or else whitespace-collapsed text, equals `<name>` exactly. Then it waits 800 ms and prints the URL and text. The name is case-sensitive and must match the whole label.
- `state` prints the current URL, title, and text without acting.
- The harness has no typing, scrolling, or key-press actions. A feature that needs them, such as city search, is out of reach until someone adds the action to `scripts/control/web.ts`. Report that instead of claiming the feature passed.

Routes come from `shared/destinations.ts`: `/verse/<Book>/<chapter>/<verse>`, `/home`, `/widgets` (calendar), `/assemblies`, `/commentary`, `/settings`, `/account`, `/sources`, `/commentary-sources`, `/support`, `/donate`, `/features`, `/terms`, `/privacy`, `/feedback`. Feature recipes are in [features/](features/README.md).

## Evidence

```bash
bun scripts/control/web.ts evidence
```

This writes `screenshot.png`, `state.txt` (URL, title, text), and a transcript, if one exists, to `artifacts/verify/web/<timestamp>-<last action>/` and prints that `path`. `artifacts/verify/` is git-ignored. Run `evidence` right after the action you are proving, because the folder is named after the last `open` or `click`.

Proof standards:

- Exercise the real reader path through routes and visible controls. Don't call internal setters, and don't seed `localStorage` by hand.
- Capture before and after: one `evidence` before the action and one after, so the change of state is visible.
- Read the screenshot, not just the text. Hebrew niqqud, RTL direction, and layout regressions only show in the image.
- Commentary, accounts, assemblies, and the calendar API need `server/` running on port 3000 (`bun scripts/control/server.ts`). Without it those screens show their offline or error state. Say which state you proved.

## Cleanup

```bash
bun scripts/control/web.ts stop    # kills only the recorded server and browser trees
bun scripts/control/web.ts reset   # stop, delete the run dir, delete web/.env only if start created it
```

Both commands kill by recorded PID, never by process name. Neither one touches `artifacts/verify/`, so evidence survives cleanup. Run `stop` after every failed attempt too, so a broken run doesn't leave ports held.
