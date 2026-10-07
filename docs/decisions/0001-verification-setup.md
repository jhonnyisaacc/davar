# Verification control CLIs

## Context

Davar needs one way for an agent to launch, drive, and prove the web reader, the Hono API, and the Python knowledge worker before refactors start. React Native driving needs Maestro, which is a new runtime dependency.

## Decision

Ship `.cursor/skills/verify-davar/` plus four control CLIs under `scripts/control/`. Web uses Chrome DevTools. The API uses HTTP. The knowledge worker uses a tmux session around `python3 -m scripts.knowledge`. Mobile `drive` and `evidence` exit `maestro-unimplemented`. `./scripts/check` runs the existing Web, Mobile, Server, and Python CI commands without dropping a step.

## Alternatives

A single browser driver for every surface would miss the API and the worker. Adding Maestro would be a new dependency. Editing the CI workflows to call `./scripts/check` would touch deploy and CI files.

## Evidence

The skill's Launch, Doctor, Drive, Evidence, and Cleanup sections name the commands. `feature-map.md` lists five features and the command that checks each one.

## How to undo

Delete `.cursor/skills/verify-davar/`, `scripts/control/`, `scripts/check`, and this record. Restore the `.cursor/` gitignore line.

## Status

Accepted for the verification-setup PR. Mobile driving stays unimplemented until Maestro is approved.
