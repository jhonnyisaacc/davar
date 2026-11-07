# Knowledge worker

The knowledge worker checks the committed biblical-knowledge pilot. It is a terminal command, not a listening service.

## Sub-features

- `knowledge-validate` checks the committed pilot output.
- `knowledge-check` rebuilds the pilot in a temp directory and compares it to the committed output.

## How to get to it (user POV)

- From the repository root, run `PYTHONPATH=. python3 -m scripts.knowledge validate`.
- Run `PYTHONPATH=. python3 -m scripts.knowledge check` to rebuild and compare.

## Driving it with scripts/control

Preconditions:

- `bun scripts/control/worker.ts start` printed `status ok`, and `bun scripts/control/worker.ts doctor` prints `status ok` and `session davar-verify-worker`.

- **Validate.** Run `bun scripts/control/worker.ts drive validate`. `exit` is `0` and `tail` contains `knowledge validate: OK`.
- **Check.** Run `bun scripts/control/worker.ts drive check` when the change touches `scripts/knowledge` or `data/knowledge`. `exit` is `0` and `tail` contains `knowledge check: OK`.
- **Proof.** Run `bun scripts/control/worker.ts evidence`. The folder under `artifacts/verify/worker/` contains `output.txt` and `exit.txt`.

## Gotchas

- `doctor` fails with `python-deps-missing` until `jsonschema` and `referencing` import. The CLI doesn't install them.
- `validate` and `check` are the only drive actions. The CLI doesn't accept an arbitrary shell command.
- `check` writes only inside a temporary directory. It doesn't update `data/knowledge`.
- `reset` kills the tmux session and leaves `artifacts/verify/worker/` in place.
