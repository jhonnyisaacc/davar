# Pinned Bore calendar rules (verbatim consumer copy)

This directory is a byte-identical copy of `api/lib/bore/` from PR #250
(`feat/davar-v2`). The Bun server only *consumes* these rules through
`bridge.py` (stdin/stdout JSON) — see `src/services/calendar.ts`. It is not
a new calendar engine: Aviv policy and observation provenance stay explicit
prerequisites.

- Upstream provenance: see `UPSTREAM.md`.
- License: see `LICENSE` (MIT, Jhonny). The attribution is preserved here.
- Do not edit these files to change calendar behavior; change the pinned
  source in `api/` and re-copy.
