# Bore pytest against the server tree

## Context

Rails CI runs the Bore suite from `api/` with `PYTHONPATH=lib/bore` and `python -m pytest test/bore -q` (`.github/workflows/davar-api-ci.yml`, `api/config/ci.rb`). The same library is copied at `server/lib/bore`. Server CI diffs the two trees and does not run the suite against the copy. The tests live in `api/test/bore`.

## Decision

Run that suite with `PYTHONPATH` pointed at `server/lib/bore` and leave `api/test/bore` where it is. The workflow path change stays with the deletion step. This change does not edit `.github/workflows/` and does not delete `api/`. No new dependency. The trees match aside from `server/lib/bore/README.davar.md`, which the existing parity diff already excludes.

## Alternatives

Move `api/test/bore` under `server/`. The tests stay in place for this change.

Point the Rails job at `server/lib/bore` in this change. That edits the workflow. The deletion step owns that path.

Delete `api/` so the copy is the only tree. Deletion stays closed until the checklist is covered.

## Evidence

Python 3.12.3. Packages from `api/requirements.txt` (pytest 9.1.1). Working directory `api/`.

```
cd api && PYTHONPATH=../server/lib/bore python3 -m pytest test/bore -q
```

```
.........................                                                [100%]
25 passed in 0.04s
```

The Rails path, same directory and the same tests:

```
cd api && PYTHONPATH=lib/bore python3 -m pytest test/bore -q
```

```
.........................                                                [100%]
25 passed in 0.04s
```

## How to undo

Delete this record. No product code changed.

## Status

Accepted for checklist row 58.
