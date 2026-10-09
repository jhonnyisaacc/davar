# Knowledge worker

The knowledge worker checks the committed biblical-knowledge pilot. It is a terminal command, not a listening service.

## Sub-features

- `knowledge-validate` checks the committed pilot output.
- `knowledge-check` rebuilds the pilot in a temp directory and compares it to the committed output.

## How to get to it (user POV)

- From the repository root, run `PYTHONPATH=. python3 -m scripts.knowledge validate`.
- Run `PYTHONPATH=. python3 -m scripts.knowledge check` when the committed output should be regenerated and compared.

## Driving it with the worker control CLI

Preconditions:

- `bun scripts/control/worker.ts doctor` prints `status ok` and `session davar-verify-worker`.
- `python3` can import `jsonschema` and `referencing`.

- **Validate.** Run the validate command in the worker session. Run `bun scripts/control/worker.ts drive validate`. `exit` is `0` and `tail` contains `knowledge validate: OK`.
- **Check.** Run the compare command in the same session. Run `bun scripts/control/worker.ts drive check`. `exit` is `0` and `tail` contains `knowledge check: OK`.
- **Proof.** Run `bun scripts/control/worker.ts evidence`. The artifact directory contains `output.txt` and `exit.txt` from the terminal session.

## Gotchas

- Doctor fails with `python-deps-missing` until `jsonschema` and `referencing` import. The CLI does not install them.
- `validate` and `check` are the only drive actions. The CLI does not accept an arbitrary shell command.
- `check` writes only inside a temporary directory. It does not update `data/knowledge`.
- Reset kills the tmux session and leaves `artifacts/verify/worker/` in place.
