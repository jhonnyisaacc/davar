# Proposed plan

Ordered, behavior-preserving pull requests for an agent-friendly Davar. Base every one on `feat/davar-v2`. Order follows the v2.6 rules: verification setup, then codebase, static analysis, rules / Bugbot, skills, then style.

A refactor PR keeps the behavior that a pin asserts. If a refactor finds a bug, ship the refactor against the current behavior and fix the bug in a later PR.

**Tier A** means Jhonny decides before the PR is written: migrations, production, deploy / infra / CI files, secrets, auth / billing / permissions, a breaking public contract, removing user-visible behavior, a framework switch, a new runtime dependency or major bump, raising a ratchet baseline, or editing a guardrail file (`AGENTS.md`, `.cursor/**`, hooks, Bugbot config). Everything else is Tier B: the agent decides, records the choice in the PR body, and ships it.

Each PR names the check that must pass. Today those checks are per app (`report.md` "Tests and verification"). Until a root check exists, run the app command the PR touches. Python, when dependencies from `requirements.txt` are installed:

```bash
PYTHONPATH=. python -m pytest -q tests tools/bani/tests
```

That command passed 373 tests in 42.09s on Python 3.12.3 during the review (`docs/review/evidence/tests.json`).

## Setup (before structural edits)

### 1. Feature map

Add `feature-map.md` at the repo root with five features and one check each:

| Feature | Check |
| --- | --- |
| Read a verse | Web route for a book, chapter, and verse renders Hebrew text from static JSON. |
| Word card | Selecting a token opens the lexicon card. |
| Calendar | `GET /api/v1/calendar/upcoming` returns the documented keys. |
| Assemblies | Signed-in client can list assemblies. |
| Commentary | Commentary screen loads for a verse reference. |

No new dependency. Not Tier A.

Verify: the file exists and each row names a command or a control-CLI subcommand from PRs 2–4.

### 2. HTTP control CLI for `api/` and `server/`

Add `tools/ctl/` as a Python stdlib CLI (no new package) with `doctor`, `start`, `stop`, `drive`, `state`, `evidence`, and `reset`.

- `doctor` checks Ruby, Bundler, Bun, `psql`, and `DATABASE_URL` without printing secret values.
- `drive` calls `GET /up` and one authenticated `/api/v1` route against whichever process is on port 3000.
- `state` prints the HTTP status and the top-level JSON keys.
- `evidence` writes the response body and the command log under a temp directory the CLI prints.

Not Tier A. It does not edit CI, add a dependency, or change auth rules.

Verify: `python3 tools/ctl/http_ctl.py doctor` exits non-zero on this image (ruby and bun are absent) and names the missing binaries. With both runtimes installed, `drive` against a sandbox returns exit 0 for `/up`.

### 3. Python pipeline control CLI

Add `tools/ctl/python_ctl.py` with the same subcommand names. `doctor` checks Python against `mise.toml` (3.13) and imports `pytest` and `jsonschema`. `drive` runs one existing module help (`python -m scripts.knowledge --help` or the module's actual help flag) and `state` prints the exit code. `reset` removes only files the CLI itself wrote.

Not Tier A.

Verify: `doctor` on this image reports Python 3.12.3 against the mise pin 3.13, and `drive` exits 0.

### 4. Web control CLI

Add `tools/ctl/web_ctl.py`. `doctor` checks Bun and that `web/public/data` or the `web/data` symlink resolves. `start` / `stop` wrap `bun run dev` in `web/`. `drive` speaks Chrome DevTools Protocol on a debugging port. Implement the socket handshake in the stdlib so this PR adds no package.

If a stdlib socket client cannot complete a CDP handshake, stop that PR and mark a follow-up **Tier A** for the driver dependency. Do not add the dependency in the same breath.

Not Tier A while it stays stdlib-only.

Verify: `doctor` reports the broken `web/data` → `public/data` symlink (`dev_env.json`). After `generate-data:ensure`, `doctor` passes the data check. `drive` opens the verse feature from `feature-map.md` and `evidence` saves a screenshot path.

### 5. Mobile control CLI

**Tier A.** Maestro (or another React Native driver) is a new tool. Subcommands match the others. `drive` runs the verse feature and the word-card feature from the map.

Verify: `doctor` prints the emulator or simulator state. One `drive` recording is attached to the PR.

### 6. Verification skill

**Tier A.** Guardrail path. Generate `.cursor/skills/verify-davar/` with `/create-verification-skill` (Launch, Doctor, Drive, Evidence, Cleanup) pointed at PRs 2–5 and `feature-map.md`. pstack was not installed in the review environment, so this PR starts by installing the plugin, then running that skill.

Verify: the skill's doctor command exits 0 on a machine that has passed PRs 2–4, and the PR includes one evidence log from it.

## Codebase

### 7. Make Web CI typecheck pass

`NavigationBar.test.tsx(47,37)` is `error TS2322` on current `HEAD` (Actions run 37613868519). Update the test fixture so it typechecks against the current books prop. Do not change the component's runtime output.

Not Tier A.

Verify: `cd web && bun x tsc --noEmit`.

### 8. Pin the contracts that later PRs must keep

Add characterization tests under `tests/pins/`:

- The `/api/v1` route list in `api/config/routes.rb` matches `server/tests/routes.test.ts` `RAILS_ROUTES` (copy the current list, including any drift, so the pin locks today's behavior).
- JSON keys already asserted in `server/tests/fixtures/contract.json`.
- `shared/staticDataPaths.ts` path strings.
- One golden transliteration from `tools/bani` (`miqveh` / `H4723` is already in `tools/bani/tests/test_syllable_shortening.py`; re-export that expectation as a pin if the existing test is the contract).

Not Tier A. Pins lock current behavior, including bugs.

Verify: `PYTHONPATH=. python -m pytest -q tests/pins` plus `cd server && bun test tests/routes.test.ts tests/contract.test.ts`.

### 9. One TS2009 book file map

Move `TS2009_BOOK_FILE_MAP` into `shared/` and delete the copies in `web/src/app/services/staticData.ts`, `mobile/src/services/scripture.ts`, and `scripts/generate-static-data/index.ts`. Values stay identical. `patterns.json` shows the three copies.

Not Tier A. Adding an export to `shared/` does not remove a public route or change a JSON shape.

Verify: pins from PR 8, `cd web && bun test src/app/services/staticData.loading.test.ts`, `cd mobile && bun test src/services/*.test.ts`.

### 10. Split `staticData.ts` behind the same exports

2,572 lines, score 82,304 (`hotspots.json`). Move fetch, lexicon, and TS2009 loading into files under `web/src/app/services/` that `staticData.ts` re-exports. Callers stay on the same functions. No behavior change. Pins from PR 8 stay untouched.

Not Tier A.

Verify: the web CI test list (`bun test` from `web/`).

### 11. Split `App.tsx` behind the same screen behavior

2,173 lines, 81 commits, the highest score in the repo. Move screen state into the existing `web/src/app/features/reader/` hooks. `App.tsx` keeps composing them. Reading position storage stays `davar.readingState`.

Not Tier A.

Verify: web `bun test` and a web control-CLI `drive` of the verse feature (PR 4).

### 12. Web calendar and assemblies into feature folders

`web/src/app/components/CalendarPanel.tsx` and `AssembliesWorkspace.tsx` move under `web/src/app/features/calendar/` and `features/assemblies/`, matching mobile's feature folders (`patterns.json`). Imports update in the same PR. Screen output stays the same.

Not Tier A.

Verify: web tests that import those components (`CalendarPanel.test.tsx`, `Assemblies.test.tsx`) and the feature-map checks for calendar and assemblies.

### 13. Stop hand-copying the route list

Generate the expected route list in `server/tests/routes.test.ts` from `api/config/routes.rb` at test time, or from one checked-in manifest that both sides read. Delete the hand-maintained `RAILS_ROUTES` array. The pin from PR 8 must still pass, which means the generated list equals today's routes.

Not Tier A, as long as both servers stay and no route is added or removed.

Verify: `cd server && bun test tests/routes.test.ts` and the PR 8 pin.

### 14. Shared Zod schemas for `/api/v1`

**Tier A.** New runtime dependency: `zod` is in `server/package.json` and absent from `shared/`, `web/`, and `mobile/` (`patterns.json` `shared_has_zod: false`). Define the existing `productContracts.ts` shapes with Zod in `shared/`, keep `z.infer` types identical to today's TypeScript types, and parse at the Hono boundary with those schemas. Rails keeps strong params until PR 15 chooses one server. Response JSON keys do not change.

Verify: server contract tests and web/mobile typecheck. The PR body shows the dependency diff.

### 15. One product API process

**Tier A.** Framework switch and removal of a surface, plus auth and migrations. `server/README.md` says Rails is the behavior source and Hono is a byte-compatible port. Jhonny picks which process stays. The implementation PR migrates every caller, deletes the other tree, and updates pins in the same wave. It does not start until that choice is written in `docs/decisions/`.

Whichever side is deleted also decides the fate of Solid Queue versus `server/src/jobs/*`, and of `ACTIVE_RECORD_ENCRYPTION_*` versus `DAVAR_ENCRYPTION_*` (`api/.env.example`, `server/.env.example`).

### 16. One Bore tree

**Tier A** because deleting a copy changes `.github/workflows/server-ci.yml` (the `bore-parity` job). Point both apps at one directory (`api/lib/bore` or a top-level `bore/`) and delete the other. `api/lib/bore/calendar/localization/i18n.py` and `server/lib/bore/calendar/localization/i18n.py` are the duplicated `type: ignore` pair (`static_analysis.json`).

Verify: `PYTHONPATH=lib/bore python -m pytest test/bore -q` from `api/`, and the server tests that shell out to Bore.

### 17. One CLI per Python pipeline

For `scripts/dict/` and `scripts/delitzsch/`, keep `python -m scripts.<name>` and delete standalone entry scripts only after a pin compares their stdout on a fixture. `inventory.json` lists both `__main__.py` files and the extra CLIs.

Not Tier A.

Verify: the pipeline pin and `python_ctl.py drive`.

### 18. Fold `mobile/components/` into `mobile/src/components/`

`mobile/app/(tabs)/explore.tsx` still imports `parallax-scroll-view`, `themed-text`, `themed-view`, and `external-link`. Move those files next to the other mobile components and update imports. Do not delete the explore route in this PR.

Not Tier A.

Verify: `cd mobile && bun run typecheck && bun test`.

## Static analysis

These PRs add CI or a new tool. Each one is **Tier A**. The first version of a baseline records the count this review measured. Later PRs may only lower it. Raising it is a new Tier A decision.

### 19. Python lint and types

Add Ruff and basedpyright with a shrink-only baseline. Wire the same command locally and in CI. Current counts to seed the baseline are in `static_analysis.json`: 6 `noqa` in `scripts/`, 2 in `tests/`, 1 in `tools/`, and 3 `type: ignore` files across `api/`, `server/`, and `scripts/translate/__main__.py`. There is no `pyproject.toml` today.

Verify: the new command exits 0 on `HEAD` with the baseline, and exits non-zero if a fixture adds a `noqa`.

### 20. Import boundaries in CI

Promote `docs/review/scripts/import_graph.py` (or dependency-cruiser, which would be a new dependency and still Tier A) to a required check. Seed the baseline with the one cycle (`scripts/knowledge/core.py` ↔ `validate.py`) and the six cross-area edges in `import_graph.json`. The check fails when a PR adds a cycle or a cross-area edge.

Breaking the knowledge cycle is a separate behavior-preserving PR after the baseline exists: pass `Validator` in from the caller so `core.py` does not import `validate.py`. Not Tier A once the checker exists. Do it in the PR after this one only if the baseline PR has merged.

### 21. Server lint

**Tier A** (Biome as a new devDependency of `server/`). Same rule set as `web/biome.json` where it applies to TypeScript without DOM. `server/package.json` has no `lint` script today.

Verify: `cd server && bun run lint && bun run typecheck && bun test`.

### 22. Suppression ratchet

**Tier A** (CI job plus the baseline). Counts that may only fall, seeded from `static_analysis.json`:

| Counter | Seed |
| --- | ---: |
| web `biome-ignore` | 6 |
| mobile `eslint-disable` | 18 |
| `type: ignore` | 3 |
| Python `noqa` | 9 (6 + 2 + 1) |
| `@ts-ignore` | 0 |
| `@ts-expect-error` | 0 |
| `as any` / `any[]` | 0 |

The lint error text names the helper to use instead of a disable comment. No new inline disables.

## Rules / Bugbot

### 23. Short `AGENTS.md` map

**Tier A** (guardrail file). Replace the Surfaces section so it names `api/`, `server/`, `web/`, `mobile/`, `shared/`, `scripts/`, `tools/bani/`, and `contracts/`. State one command per app, point at `feature-map.md`, `tools/ctl/`, and `docs/decisions/`. Record TS2009 as the R2 path in `docs/API_TESTING_GUIDE.md` and `web/wrangler.jsonc`, and mention the Supabase keys only if a script still reads them (`scripts/generate-static-data/`). Keep the rule-to-enforcer table in a linked file so `AGENTS.md` stays short. Keep the line that forbids a second tree under `.github/prompts/` and `.github/instructions/`. Point at `.github/skills/` so agents see the five skills that already exist.

### 24. Bugbot config

**Tier A.** Add `.cursor/BUGBOT.md` and `.cursor/config/bugbot.yaml` as the v2.6 rules specify: drafts off, once per PR, incremental, effort low, PR summary off, autofix off. `BUGBOT.md` does not ask for justifying comments. Do not run `/review-bugbot` in the PR that adds the file.

### 25. `guard-paths` and hooks

**Tier A.** A required check fails on Tier A paths unless the label Jhonny uses is present. `hooks.json` denies writes to `.cursor/**` from command hooks, denies reading `.env` files, and fails closed. Document the label name in the check output.

## Skills

### 26. Project skill that runs the check

**Tier A** if it lands under `.cursor/skills/` or `.github/skills/`. One skill, `verify-davar`, already created in PR 6. This PR only adds a pointer from `AGENTS.md` if PR 23 did not, and a `doctor` snippet for the root check script below. Skip a second skill that restates `AGENTS.md`.

Root check script `scripts/check.sh` (not Tier A by itself, no workflow edit): runs the Python suite and prints the exact `cd web && ...` / `cd mobile && ...` / `cd server && ...` / `cd api && ...` commands without invoking Bun or Bundler when those binaries are missing. Wiring it as a required GitHub check is **Tier A** and belongs with PR 25.

## Style

### 27. Style guide, last

Add `docs/style.md` for what lint cannot encode: Hebrew UI is RTL, wording changes land in English, Spanish, and Hebrew together, and the layout stays neumorphic. Do not add code comments. Do not restate `AGENTS.md`.

Not Tier A.

## Dev environment and the red checks

### 28. Cloud environment

**Tier A** (infra). `environment.json` so a cloud agent gets Ruby 3.4.9, Python 3.13, Bun, and PostgreSQL. `dev_env.json` is the list of what was missing here. Include a snapshot only after `api/bin/dev-sandbox setup` exits 0.

### 29. Knowledge boundary versus this branch

**Tier A.** On 2026-10-07 the boundary check failed because `feat/davar-v2` modifies `.github/workflows/knowledge-foundation.yml` (run 37611663475). Changing the allowlist or the workflow changes a required check. Leave it parked until Jhonny decides whether v2 may edit that workflow. Do not repeat the earlier pattern of widening the ignore list inside a feature PR (`570a33de6`, `c78e5a744`).

### 30. Already done at this SHA

`api/Gemfile.lock` lists `x86_64-linux` (lines 229–232). The 2026-09-30 Bundler platform failure (run 36768129729) does not need a follow-up unless a new run fails the same way.

## What not to do in this series

- Do not delete Rails or Hono before PR 15's decision.
- Do not change `/api/v1` JSON keys, route paths, or encryption wire format inside a refactor PR.
- Do not raise any baseline seeded above.
- Do not add a second instruction tree under `.github/prompts/` or `.github/instructions/`.
- Do not run `/review-bugbot`, `/review`, or `/agent-review` on these PRs. Bugbot runs when a PR leaves draft.
