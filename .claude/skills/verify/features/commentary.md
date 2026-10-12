# Commentary

The commentary screen answers a question about a verse reference using the commentary corpus. It is behind the `commentary` product flag and needs the API.

## Sub-features

- `commentary-open` opens `/commentary` with the current verse as context.
- `commentary-consult` sends a consultation and shows the answer (needs the API).

## How to get to it (user POV)

- Open `/commentary` directly.
- Use the commentary entry point on a verse when the flag is enabled.

## Driving it with control/web.ts

Preconditions:

- The baseline instance is healthy.
- The API is running: `bun scripts/control/server.ts start`, then `bun scripts/control/server.ts doctor` prints `status ok`.

- **Open Commentary.** Run `bun scripts/control/web.ts drive open /commentary`. The text shows the commentary screen, not the not-found screen.
- **Proof.** Run `bun scripts/control/web.ts evidence`.
- **Consult.** Not drivable yet. Asking a question needs typed input, which `scripts/control/web.ts` doesn't have.

## Gotchas

- With the flag off, `/commentary` isn't open (`destinationOpen` in `shared/destinations.ts`). Record which state you saw.
- Without the API, the screen shows its offline or error state. That proves the route, not the feature.
- Not yet driven end to end. Confirm the exact screen text on the first run and update this file.
