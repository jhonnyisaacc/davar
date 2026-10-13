# Bore pytest in the API tree

## Context

Bore and its tests live in one tree. The library is `api/lib/bore`. The tests are `api/tests/bore`. API CI runs them from `api/` with `PYTHONPATH=lib/bore` and `python -m pytest tests/bore -q` (the `api` job in `.github/workflows/ci.yml`).

## Decision

Run that suite against this tree. There is no second copy and no parity diff.

## Alternatives

Keep the tests in another directory and point `PYTHONPATH` at `api/lib/bore`. The tests stay next to the library they import.

## Evidence

From `api/`:

```
PYTHONPATH=lib/bore python3 -m pytest tests/bore -q
```

The checklist run of this suite recorded 25 passed.

## How to undo

Delete this record. No product code changed.

## Status

Accepted for checklist row 58. The suite runs in the single `api/` tree.
