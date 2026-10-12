# Python pipeline control command

## Context

Section 4m needs a Python pipeline control command so the dict and Delitzsch pins can be driven. The refactor plan named `tools/ctl/python_ctl.py`. Verification already landed control CLIs under `scripts/control/` as Bun programs (`web.ts`, `server.ts`, `worker.ts`, `mobile.ts`).

## Decision

Add `scripts/control/python.ts` beside those files. It uses the same subcommands (`doctor`, `start`, `stop`, `drive`, `state`, `evidence`, `reset`) and the same `status` line format. `doctor` reports the running Python version against the `mise.toml` pin and whether `pytest` and `jsonschema` import. It does not install Python. `drive help` runs `python3 -m scripts.dict --help`. `drive fixture` runs `python3 -m scripts.delitzsch normalize-holem --books __pin_absent__ --dry-run`. Keep `python -m scripts.dict` and `python -m scripts.delitzsch`.

## Alternatives

A new `tools/ctl/` tree would split control CLIs across two layouts. A Python stdlib CLI would not match the Bun programs already in `scripts/control/`.

## Evidence

`tests/pins/` locks `--help` for both modules and the fixture subcommand. `bun scripts/control/python.ts drive` runs those commands.

## How to undo

Delete `scripts/control/python.ts`, `tests/pins/`, and this record. Restore `scripts/delitzsch/run_matcher.py` if the wrapper is still wanted.

## Status

Accepted for the python-pipeline-cli PR.
