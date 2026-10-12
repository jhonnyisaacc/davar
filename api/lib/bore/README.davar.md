# Bore calendar rules

The Bun server consumes these rules through `bridge.py` (stdin/stdout JSON).
See `src/services/calendar.ts`. Aviv policy and observation provenance stay
explicit prerequisites.

- Upstream provenance: see `UPSTREAM.md`.
- License: see `LICENSE` (MIT, Jhonny). The attribution is preserved here.
- Do not edit these files to change calendar behavior. Change them together
  with `server/tests/bore`.
