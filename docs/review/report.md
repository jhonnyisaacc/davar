# Davar repo review

Measured on `feat/davar-v2` at `95eec881a0b399892c95e23ea4515844fab323ed` (head of draft PR #250). This run changes nothing under `api/`, `mobile/`, `web/`, `shared/`, or CI.

Re-run from the repository root:

```bash
bash docs/review/scripts/run_all.sh
```

Captured output is `docs/review/evidence/*.json`. Claims below cite that output, a file path, or a `gh` command.

## Method

pstack has no whole-repo review skill (coverage map section 4a). The numbers come from the scripts in `docs/review/scripts/`. The checklist for competing patterns is pstack `design-red-flags`: two ways to do one task, hand-synced lists, importable internals, split ownership, and files at or past 1,000 lines.

`/how`, `/why`, and `/correct` are not installed in this environment (no `SKILL.md` under the workspace or `~/.cursor` for those names). Three read-only Explore passes covered `api/` plus `server/`, `web/` plus `mobile/`, and the Python pipelines plus docs. `agent_history.py` uses the inputs `/correct` names: git history, reverts, and pull-request review comments. `cursor-cloud` `list-cloud-agents` (limit 20, no source filter) returned 4 agents, all from this review run, so there is no earlier cloud-agent transcript to mine.

Score rubric, 0 to 3, from the coverage map:

| Score | Meaning |
| --- | --- |
| 0 | Missing |
| 1 | Present, with duplication or no enforcement |
| 2 | One main path, checked for some apps, gaps remain |
| 3 | One path, enforced, and an agent can verify it |

## Agent-readiness score

| Area | Score | Reason |
| --- | --- | --- |
| Codebase | 1 | `shared/` is a real cross-client package and app imports stay inside their trees, but `/api/v1` has two servers, scripture loading has two implementations, and route plus TS2009 maps are copied by hand. |
| Static analysis | 2 | Web and mobile run strict TypeScript and a linter in CI. Server typechecks with `noUncheckedIndexedAccess`. Python and Ruby have no linter, and nothing ratchets suppressions or layers. |
| Rules / Bugbot | 1 | `AGENTS.md` is 31 lines and omits `api/` and `server/`. `BUGBOT.md`, `bugbot.yaml`, `.cursor/`, and `hooks.json` are absent (`dev_env.json`). |
| Skills | 1 | Five skills live under `.github/skills/`. There is no verification skill. |
| Style | 1 | Web and mobile both format with Biome. There is no style guide. `AGENTS.md` still tells agents to write comments. |
| Verification | 1 | 124 test files. The Python suite passed here in 42.09s. There is no single check command, feature map, or control CLI. Bun and Ruby tests were not run: those binaries are absent. |
| Dev environment | 1 | `mise.toml`, env examples, `api/compose.yml`, and `api/bin/dev-sandbox` exist. `api/bin/dev-sandbox setup` exited 127 because `ruby` is not installed. `bun`, `mise`, and `psql` are absent. `web/data` points at a missing `public/data`. |

Total: **8 / 21**.

CI history and agent-mistake history are scored in their own sections (both 1). They are evidence for the seven areas above, not extra points.

## Inventory

`inventory.json`. Top-level directories: `api`, `contracts`, `data`, `design`, `docs`, `locales`, `mobile`, `scripts`, `server`, `shared`, `tests`, `tools`, `web`.

`data/` is 39,306 files and 773,776,310 bytes. It is excluded from the source counts below. `docs/review/` (this review) is excluded too.

| Area | Source files | Source lines | What the lines are |
| --- | ---: | ---: | --- |
| `api/` | 163 | 7,807 | Ruby 5,254, Python 2,490, Rake 63. Rails 8.1 (`api/Gemfile`: `rails ~> 8.1.3`). |
| `server/` | 123 | 13,158 | TypeScript 10,976, Python 2,182. Bun + Hono (`server/package.json`). |
| `web/` | 109 | 21,502 | TSX 13,528, TS 7,603, JS 371. React on Bun. |
| `mobile/` | 136 | 23,215 | TSX 14,701, TS 8,453, JS 61. Expo (`mobile/package.json` `"main": "expo-router/entry"`). |
| `shared/` | 31 | 5,653 | TypeScript helpers imported by web and mobile. |
| `scripts/` | 194 | 42,545 | Python 40,654, TypeScript 1,891 (`scripts/generate-static-data/`). |
| `tools/` | 9 | 4,416 | Python. `tools/bani/` transliteration engine. `tools/bani/research/` is excluded. |
| `tests/` | 37 | 6,558 | Python 6,545, TypeScript 13. |
| `locales/` | 1 | 730 | `locales/legalContent.ts`. JSON catalogs are not in the source-extension count. |

Root `package.json` has dependencies only (`expo`, `typescript`). It has no scripts. `mise.toml` pins Python 3.13 and Ruby 3.4.9.

### Entrypoints

| App | Entry | How it starts |
| --- | --- | --- |
| Rails `api/` | `api/config.ru`, `api/bin/rails`, `api/bin/dev`, `api/bin/dev-sandbox`, `api/bin/jobs` | `bundle exec rails server` or `api/bin/dev-sandbox`. Port 3000 (`README.md`). |
| Hono `server/` | `server/src/index.ts` | `cd server && bun run dev`. Port 3000 (`server/package.json`, `server/README.md`). |
| React `web/` | `web/src/main.tsx`, `web/server.ts`, `web/build.ts` | `cd web && bun run dev` (`web/package.json`: `bun ./scripts/dev-hot.ts`). Port 5173. |
| Expo `mobile/` | `expo-router/entry`, `mobile/app/_layout.tsx` | `cd mobile && bun run start`. Port 8081. |
| Python | `scripts/{delitzsch,dict,greek,knowledge,translate}/__main__.py`, plus CLIs under `scripts/*/` and `tools/bani/` | `python -m scripts.<name>` from the repo root (`README.md` test line uses `PYTHONPATH=.`). |

`server/` is present. It is the Bun + Hono port of the Rails API (`server/README.md` lines 1–12). Rails remains the documented behavior source when the two disagree.

## Contracts and boundaries

Product HTTP is `/api/v1` on both stacks.

- Client types live in `shared/productContracts.ts`, `shared/productClient.ts`, `shared/productCapabilities.ts`, `shared/assembliesClient.ts`, `shared/calendarClient.ts`, and `shared/accountSession.ts`. Web calls them from `web/src/app/services/productApi.ts`. Mobile calls them from `mobile/src/features/account/session.ts`.
- Server request bodies are Zod (`patterns.json`: `zod` imports in `server/src/http/validation.ts` and six route files). `shared_has_zod` is false. Rails validates with strong params and Active Record (`api/config/routes.rb`, `api/app/`).
- Route parity is a copied list. `server/tests/routes.test.ts` lines 5–8: "Hand-maintained from `api/config/routes.rb`". `patterns.json` finds `RAILS_ROUTES` only in that test.
- OpenAPI: `rg -i openapi api server shared contracts` returns no matches. `patterns.json` records Zod on the Hono side only.
- `contracts/biblical-knowledge/v1/` is JSON Schema Draft 2020-12 for an optional data set. `contracts/biblical-knowledge/v1/README.md` lines 3–6 say it has no application imports and no API endpoints. Python validates it (`scripts/knowledge/`, `.github/workflows/knowledge-foundation.yml`).
- Scripture JSON is produced from `data/` by `scripts/generate-static-data/index.ts` into `web/public/data/` (that directory is absent on this checkout; see Dev environment). Path helpers: `shared/staticDataPaths.ts`.
- Calendar math is Python Bore, copied: `api/lib/bore` and `server/lib/bore` (`patterns.json` `bore_directories`). `.github/workflows/server-ci.yml` has a `bore-parity` job that diffs them (`tests.json` workflow command list includes server `bun test` and `bun run typecheck`).
- Databases: 7 Active Record migrations in `api/db/migrate/`. 2 SQL files in `server/drizzle/` (`0001_davar_domain.sql`, `0002_calendar_feed.sql`). `server/README.md` says `0001` mirrors Rails domain migrations `20260930000001` through `20260930000005` and does not port Solid Queue (`api/db/migrate/20261003000001_add_solid_queue.rb` exists).

Sign-in providers are a shared const: `SIGN_IN_PROVIDERS` in `shared/productContracts.ts` (`google`, `apple`, `facebook`, `telegram`, `x`, `email`). Auth code is implemented twice (`api/app/controllers/api/v1/auth_controller.rb`, `server/src/http/routes/auth.ts`). No Stripe gem or dependency showed up in `api/Gemfile` or `server/package.json`.

## Hotspots

`hotspots.py` score is commit count times current line count. Windows: all history on `HEAD`, last 180 days (since 2026-04-10), and commits after the merge-base with `main` (`c10a71a7480a069dad65ea7bbaae8180e2b32b58`, 82 commits, `git rev-list --count main..HEAD`).

All history, top of `hotspots.json`:

| Score | Commits | Lines | Path |
| ---: | ---: | ---: | --- |
| 176,013 | 81 | 2,173 | `web/src/app/App.tsx` |
| 128,520 | 70 | 1,836 | `mobile/src/components/WordAnalysisBottomSheet.tsx` |
| 103,424 | 64 | 1,616 | `mobile/src/screens/VerseDetailContent.tsx` |
| 82,304 | 32 | 2,572 | `web/src/app/services/staticData.ts` |
| 56,610 | 34 | 1,665 | `mobile/src/services/scripture.ts` |
| 38,962 | 46 | 847 | `web/src/app/components/NavigationBar.tsx` |
| 36,278 | 34 | 1,067 | `web/src/app/components/WordCard.tsx` |
| 22,644 | 17 | 1,332 | `scripts/generate-static-data/index.ts` |

Since the merge-base with `main` (the v2 work), the top scores are `App.tsx` (7 commits), `VerseDetailContent.tsx` (6), `NavigationBar.tsx` (8), `staticData.ts` (2), and `mobile/src/features/calendar/CalendarScreen.tsx` (6). Server route code shows up here too: `server/src/http/routes/assemblies.ts` (7 commits, 496 lines).

Files at or above 1,000 lines (`inventory.json`):

| Lines | Path |
| ---: | --- |
| 2,572 | `web/src/app/services/staticData.ts` |
| 2,410 | `shared/versificationData.ts` (header says generated from shafan `versification.json`) |
| 2,173 | `web/src/app/App.tsx` |
| 1,836 | `mobile/src/components/WordAnalysisBottomSheet.tsx` |
| 1,665 | `mobile/src/services/scripture.ts` |
| 1,616 | `mobile/src/screens/VerseDetailContent.tsx` |
| 1,601 | `tools/bani/scripts/en.py` |
| 1,523 | `tools/bani/scripts/es.py` |
| 1,516 | `scripts/hutter/map_strongs.py` |
| 1,332 | `scripts/generate-static-data/index.ts` |
| 1,313 | `scripts/dict/build_lexicon.py` |
| 1,285 | `scripts/hutter/verse_images.py` |
| 1,078 | `scripts/tth/md_to_json.py` |
| 1,067 | `web/src/app/components/WordCard.tsx` |
| 1,062 | `scripts/tth/json_postprocess.py` |

## Competing patterns

`patterns.json` plus the paths it names.

| Task | Ways found |
| --- | --- |
| Product HTTP | Rails in `api/` and Hono in `server/`, same `/api/v1` paths, both meant to bind port 3000 (`README.md`, `server/README.md`). |
| Request validation | Zod in `server/`. Strong params in Rails. No Zod in `shared/`. |
| Scripture load | `web/src/app/services/staticData.ts` (fetch `/data/...`) and `mobile/src/services/scripture.ts` plus `mobile/src/services/database.ts` (SQLite). |
| TS2009 book file map | Three copies: `web/src/app/services/staticData.ts`, `mobile/src/services/scripture.ts`, `scripts/generate-static-data/index.ts`. |
| UI strings | `export const useTranslation` in `web/src/app/hooks/useTranslation.ts` and `mobile/src/i18n/useTranslation.ts`. |
| Reader state | Web keeps book, chapter, and verse in `web/src/app/App.tsx` via `usePersistedState`. Mobile keeps `currentVerseId` in Zustand `mobile/src/store/useAppStore.ts` (`patterns.json` lists three `zustand` imports, all under `mobile/`). |
| Feature folders | Web features: `account`, `assemblies`, `commentary`, `product`, `reader`. Mobile features: `account`, `assemblies`, `calendar`, `commentary`, `product`. Web calendar and assemblies screens still sit in `web/src/app/components/` (46 entries). Mobile also has `mobile/components/` (6 files). `mobile/app/(tabs)/explore.tsx` still imports `parallax-scroll-view`, `themed-text`, `themed-view`, and `external-link` from that second tree. |
| Lint | Web: Biome (`web/biome.json`, `web/package.json` `lint`). Mobile: `expo lint` (`mobile/eslint.config.js`); `mobile/biome.json` formats and sets `linter.enabled` false. Server: `typecheck` and `test` only (`server/package.json`). |
| Calendar engine | `api/lib/bore` and `server/lib/bore`. |
| Jobs | Rails Solid Queue (`api/bin/jobs`, `api/Gemfile` `solid_queue`). Server one-shot Bun scripts (`server/package.json` `jobs:*`). |
| Python CLIs | `scripts/dict/` and `scripts/delitzsch/` each have a package `__main__.py` and additional standalone `argparse` scripts beside it (`inventory.json` entrypoint list). |
| Transliteration | `tools/bani/` is the engine. `scripts/translit/` calls it. `scripts/dict/update_transliterations.py` can derive ASCII or call Bani (`tools/bani/tests/test_syllable_shortening.py` imports that dict script: import-graph cross edge). |

`ProductClient` has one definition (`shared/productClient.ts`) and callers in web and mobile. That boundary is the one that already matches the rules.

## Import graph and cycles

`import_graph.py`. It records relative imports and the aliases `@/` and `@davar/shared/*`. A specifier that lands on an existing file or directory counts as resolved. Rails autoload (Zeitwerk) is not in the graph; only `require_relative` is. External packages are ignored.

| Measure | Value |
| --- | ---: |
| Files scanned | 803 |
| Internal edges | 1,506 |
| Unresolved relative or alias specs | 0 |
| Code edges that leave an area outside the allowlist | 6 |
| Cycles found | 1 |

The cycle is `scripts/knowledge/core.py` → `scripts/knowledge/validate.py` → `scripts/knowledge/core.py`. `validate.py` imports `COLLECTIONS`, `ROOT`, `digest`, `encoded`, and `read_json` from `.core`. `core.py` line 87 imports `Validator` from `.validate`.

Allowlist includes `web→shared`, `mobile→shared`, `server→shared`, `scripts→shared`, `scripts→tools`, and `tests→scripts`. The six edges outside it:

| From | To |
| --- | --- |
| `tests/fixtures/knowledge/legacy-mapping.test.ts` | `shared/translationConfig.ts` |
| `web/src/app/services/transliterationPolicy.test.ts` | `scripts/generate-static-data/transliteration-policy.ts` |
| `web/src/app/services/besorahPolicy.test.ts` | `scripts/generate-static-data/besorah-policy.ts` |
| `web/src/app/services/dssTransformation.test.ts` | `scripts/generate-static-data/dss-transformation.ts` |
| `tools/bani/tests/test_syllable_shortening.py` | `scripts/dict/update_transliterations.py` |
| `mobile/src/screens/LegalScreen.tsx` | `locales/legalContent.ts` |

No production edge from `web/` to `mobile/`, or from either client to `server/` or `api/`, showed up. The duplication in the competing-patterns table is copied code, which a cycle checker will not catch. Nothing in CI runs this graph (`static_analysis.json` has no dependency-cruiser config).

## Static analysis

`static_analysis.json`.

| App | Typecheck | Lint | Strict |
| --- | --- | --- | --- |
| `web/` | `tsc --noEmit` | Biome | `web/tsconfig.json` `"strict": true` |
| `mobile/` | `tsc --noEmit` | ESLint via `expo lint` | `mobile/tsconfig.json` `"strict": true`, extends `expo/tsconfig.base` |
| `server/` | `tsc --noEmit` | none | `strict: true`, `noUncheckedIndexedAccess: true` |
| `scripts/` | `scripts/tsconfig.json` `strict: true` | none in `package.json` | |
| `api/` | `bin/rails zeitwerk:check` in `api/config/ci.rb` and `davar-api-ci.yml` | no `.rubocop.yml` | |
| Python | no `pyproject.toml`, `ruff.toml`, `mypy.ini`, or `basedpyrightconfig.json` | pytest only | |

Root `tsconfig.json` only extends `expo/tsconfig.base`. It sets no `strict` flag.

Suppression counts (occurrence totals; `word_any` is the regex `\bany\b` and matches English prose, so it is not a TypeScript `any` count):

| Area | eslint-disable | biome-ignore | @ts-ignore | @ts-expect-error | `: any` | `# noqa` | `type: ignore` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| web | 0 | 6 | 0 | 0 | 0 | 0 | 0 |
| mobile | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| server | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| shared | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| scripts | 0 | 0 | 0 | 0 | 1 | 6 | 1 |
| api | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| tools | 0 | 0 | 0 | 0 | 2 | 1 | 0 |
| tests | 0 | 0 | 0 | 0 | 0 | 2 | 0 |

`as any` and `any[]` are absent from the counts (zero matches).

- `biome-ignore` files: `web/src/app/services/staticData.ts` (2), `web/src/app/hooks/useCalendarWorkspace.ts` (2), `web/src/app/components/KoFiWidget.tsx`, `web/src/app/components/NeumorphCard.tsx`.
- All 18 `eslint-disable` hits are in `mobile/src/**/*.test.ts` (the file list is in `static_analysis.json`).
- `type: ignore`: `api/lib/bore/calendar/localization/i18n.py`, the copy `server/lib/bore/calendar/localization/i18n.py`, and `scripts/translate/__main__.py`.
- `: any`: `tools/bani/scripts/en.py`, `tools/bani/scripts/es.py`, `scripts/tth/text_cleaner.py`.

No ratchet workflow, no `dependency-cruiser` config, and no inline-disable ban showed up in `.github/workflows/`.

## Tests and verification

`tests.json` file counts:

| Area | Test files |
| --- | ---: |
| `tests/` | 37 |
| `api/` | 23 |
| `web/` | 21 |
| `server/` | 18 |
| `mobile/` | 18 |
| `scripts/` | 6 |
| `tools/` | 1 |
| **Total** | **124** |

How CI runs them (`tests.json` `workflow_commands`, taken from the workflow YAML):

| Workflow | Commands |
| --- | --- |
| `web-ci.yml` | `bun run lint`, `bun x tsc --noEmit`, `bun test` on `staticData.loading.test.ts` and `lexicon-entries.test.ts`, then `bun test` |
| `mobile-ci.yml` | `bun run lint`, `bun run test`, `bun run typecheck` |
| `server-ci.yml` | `bun run typecheck`, `bun test` |
| `davar-api-ci.yml` | `bundle exec rails zeitwerk:check`, `bundle exec rails test`, `PYTHONPATH=lib/bore python -m pytest test/bore -q` |
| `python-ci.yml` | `python -m pytest tests/test_hutter_morphology.py tests/test_hutter_attested_morphology.py -q` |
| `bani-ci.yml` | `python -m pytest -q tools/bani/tests` |
| `knowledge-foundation.yml` | `pytest` on `tests/test_knowledge_*.py` and commentary, plus two `bun test` files |
| `besorah-quality.yml`, `greek-source-quality.yml`, `hutter-transcription-ci.yml`, `translit-quality.yml` | one pytest file set each |

README baseline (`README.md` lines 73–77):

```bash
PYTHONPATH=. python -m pytest -q tests tools/bani/tests
```

Timed on this machine by `tests_inventory.py` as `python3 -m pytest -q tests tools/bani/tests` after the packages named in `requirements.txt` that those tests import were installed (`pytest`, `jsonschema`, `pyyaml`, `python-dotenv`, `httpx`, `openai`, `pydantic`, `numpy`, `requests`, `mammoth`). Result in `tests.json`: **373 passed in 42.09s**, exit code 0, Python 3.12.3 (the image Python; `mise.toml` asks for 3.13). A cold run before that install stopped at collection in about a second with `ModuleNotFoundError: No module named 'jsonschema'` (11 collection errors). That cold run was overwritten when the script was re-run; the committed `pytest_timing` object is the successful one.

`bun`, `ruby`, and `bundle` are null in `tests.json` `js_runners`. Web, mobile, server, and Rails tests were not timed.

There is no `feature-map.md`, no `doctor` / `drive` control CLI, and no `tests/pins/` directory. Mobile's local bundle is `bun run preflight` (`typecheck`, `lint`, `test`). Nothing at the repo root runs every app.

## Docs and AGENTS.md

`AGENTS.md` is 31 lines. Its Surfaces section names `web/`, `mobile/`, `shared/`, `data/`, `scripts/`, and `tools/bani/`. It does not name `api/` or `server/`. It says TS2009 comes from Supabase Storage.

`README.md` lines 57–59 tell you to run the Rails API, and lines 79–89 tell you to run `server/` on the same port. `docs/API_TESTING_GUIDE.md` line 5 says the scripture backend was eliminated and TS2009 is served from a private Cloudflare R2 bucket. `web/wrangler.jsonc` binds `TS2009_BUCKET`. `web/.env.example` still lists `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` (`dev_env.json` keys).

Other agent files (`dev_env.json` `files`): `.cursor`, `BUGBOT.md`, `environment.json`, and `hooks.json` are absent. Skills that do exist: `.github/skills/{expo,gh-cli,xai,seo,refactor-pro}/SKILL.md`. `AGENTS.md` says not to add a second instruction tree under `.github/prompts/` or `.github/instructions/`. Those two directories are absent. The skills directory is a third instruction location the map does not mention.

`docs/` holds deployment, legal, QA, and `docs/architecture/DAVAR_V2_*.md` (issue alignment, manual testing, constraints, iteration report). `docs/architecture/DAVAR_V2_MANUAL_TESTING.md` is the write-up for `api/bin/dev-sandbox`.

## Dev environment

`dev_env.json` on this cloud image:

| Tool | Result |
| --- | --- |
| python3 | 3.12.3 at `/usr/bin/python3` |
| node | v22.14.0 |
| ruby, bun, bundle, psql, mise | absent |

`api/bin/dev-sandbox setup` → exit 127, stderr `/usr/bin/env: ‘ruby’: No such file or directory`. The script's own header (`api/bin/dev-sandbox` lines 7–17) requires Ruby 3.4+, `bun`, and PostgreSQL on port 5432, then installs gems, a Python venv from `api/requirements.txt`, runs `rails db:prepare`, seeds, and builds web.

Present and useful: `mise.toml`, `.env.example` (OpenRouter keys only), `api/.env.example` (35 keys, including `DATABASE_URL` and OAuth client ids), `server/.env.example`, `web/.env.example`, `mobile/.env.example`, `api/compose.yml` (PostgreSQL for the Rails app).

`web/data` is a symlink to `public/data` and `symlink_ok` is false. `web/public/data` does not exist, so static JSON is not checked out; `web/package.json` `generate-data:ensure` is what creates it. Greek CI has failed on that missing path before (see CI).

Bring-up on this image stops at the first missing runtime. The README path (mise, then per-app Bun or Bundler) was not executed past the tool check.

## Past CI failures

`ci_failures.py` ran `gh run list --status failure --limit 100` and `gh run view <id> --json jobs`, then `gh run view <id> --log-failed` for the newest run of each workflow plus failed-step pair.

79 failures. Newest `2026-10-07T11:24:30Z`, oldest `2026-03-08T17:52:23Z`. By workflow: Web CI 26, Policy Gate 19, Knowledge foundation 15, Mobile CI 10, Backend CI 3, Besorah quality 2, Mobile EAS Release 2, Davar API 1, Greek source quality 1.

Grouped by the failed step, then by the cause in that step's newest log. Older runs in the same step sometimes failed for a different reason; those are named with the run id from `--log-failed`.

| Count | Step | Cause in the sampled log |
| ---: | --- | --- |
| 15 | Policy Gate `Secret scan` | gitleaks `fatal: Invalid revision range` then `ERROR: Unexpected exit code [1]`. Sample run [34063514760](https://github.com/jhonnyisaacc/davar/actions/runs/34063514760). Same text on run [33087401541](https://github.com/jhonnyisaacc/davar/actions/runs/33087401541) and [33089139988](https://github.com/jhonnyisaacc/davar/actions/runs/33089139988). |
| 13 | Knowledge `compatibility boundary` | `ValueError: Non-additive or out-of-scope change: M .github/workflows/knowledge-foundation.yml`. Sample [37611663475](https://github.com/jhonnyisaacc/davar/actions/runs/37611663475) on `feat/davar-v2`, 2026-10-07. Older boundary logs: [35820822307](https://github.com/jhonnyisaacc/davar/actions/runs/35820822307) deleted `.github/instructions/bun.instructions.md`. |
| 2 | Knowledge `compatibility legacy` | Newest sample [35822521382](https://github.com/jhonnyisaacc/davar/actions/runs/35822521382): `ValueError: Legacy generation changed: ['version.json']`. Run [35769830065](https://github.com/jhonnyisaacc/davar/actions/runs/35769830065): `M scripts/knowledge/__main__.py`. |
| 12 | Web CI `Run build` | Newest sample [33089139993](https://github.com/jhonnyisaacc/davar/actions/runs/33089139993): `ENOENT` opening `scripts/generate-static-data/index.part05.txt`. Run [33086685243](https://github.com/jhonnyisaacc/davar/actions/runs/33086685243): `No matching export in "src/app/components/SettingsScreen.tsx" for import "SettingsScreen"`. |
| 7 | Web CI `Run lint` | Newest sample [37137651718](https://github.com/jhonnyisaacc/davar/actions/runs/37137651718) on `feat/davar-v2`: Biome `useExhaustiveDependencies` in `CalendarPanel.tsx`. Run [34851992498](https://github.com/jhonnyisaacc/davar/actions/runs/34851992498): `useHookAtTopLevel` in `SettingsScreen.tsx`. |
| 1 | Web CI `Check TypeScript` | [37613868519](https://github.com/jhonnyisaacc/davar/actions/runs/37613868519) on `feat/davar-v2`, 2026-10-07, merge of `95eec881`: `NavigationBar.test.tsx(47,37): error TS2322` (readonly book tuple assigned to a mutable books prop). This is the newest Web CI failure and it matches current `HEAD`. |
| 3 | Mobile CI `Check TypeScript` | [35758673844](https://github.com/jhonnyisaacc/davar/actions/runs/35758673844): `WordAnalysisBottomSheet.tsx(317,5): error TS2322`. |
| 2 | Web `Create development deployment` | [34749279788](https://github.com/jhonnyisaacc/davar/actions/runs/34749279788): `HttpError: Server Error`. |
| 1 | Mobile `Create development deployment` | [34749279756](https://github.com/jhonnyisaacc/davar/actions/runs/34749279756): same `HttpError`. |
| 2 | Besorah pytest | [34069901956](https://github.com/jhonnyisaacc/davar/actions/runs/34069901956): `ModuleNotFoundError: No module named 'httpx'` and `ImportError: Grok assigner requires 'openai'`. |
| 1 | Greek source pytest | [34748347078](https://github.com/jhonnyisaacc/davar/actions/runs/34748347078): `FileNotFoundError` for `web/data/metadata.json`. |
| 1 | Davar API `ruby/setup-ruby` | [36768129729](https://github.com/jhonnyisaacc/davar/actions/runs/36768129729): Bundler exit 16, `Your bundle only supports platforms ["aarch64-linux", "arm64-darwin"]`. At current `HEAD`, `api/Gemfile.lock` lines 229–232 also list `x86_64-linux`. This failure is historical relative to this SHA. |
| 2 | Mobile EAS preflight | [33091332648](https://github.com/jhonnyisaacc/davar/actions/runs/33091332648): `Error: env:list command failed.` The same log says EAS could not read the `production` environment and `expo-router` failed to resolve. |
| 17 | several jobs, step `(no step)` | `gh run view --log-failed` returned HTTP 410 (logs expired). Sample ids in `ci_failures.json`: 24294912584, 23926012476, 23654539744, 23653083927. Cause unknown. |

CI score: **1**. Failures cluster, and two checks on the branch this review is based on were red on 2026-10-07 (Web CI typecheck, knowledge boundary).

## Agent-mistake history

`agent_history.py`. `git shortlog -sn --all`:

| Commits | Author |
| ---: | --- |
| 908 | Jhonny |
| 52 | Cursor Agent |
| 47 | jony |
| 43 | copilot-swe-agent[bot] |
| 32 | Jhonny (david) |
| 2 | cursor[bot] |

`git log --all --regexp-ignore-case --grep=revert` returns one subject: `e7787a989` (2026-04-02, copilot-swe-agent) `revert: remove CI/deployment changes to separate into dedicated PR`.

Cursor Agent's 52 commits are mostly the 2026-09-22 and 2026-09-23 refactor stack (shared destinations, Bani-only transliteration, AGENTS.md replacement, knowledge boundary follow-ups). Two of those subjects are direct responses to the knowledge gate: `570a33de6` "Ignore out-of-scope paths in the knowledge boundary guard" and `c78e5a744` "Ignore clock fields in legacy version.json comparisons." The gate failed, then a later commit widened what it ignores. That pair is the clearest repeated agent class in git: a check fails, and the next commit relaxes the check.

Copilot subjects that are fixes after review include `7ca27b4e3` "fix: code review corrections in versification, store, formatter, and postprocess" (2026-05-03) and `471f155f7`'s era of duplicate-lexicon removal (`agent_history.json` copilot list). The 2026-04-02 revert is the case of CI edits landing inside a product pull request and then being pulled back out.

Line-level review comments from `gh api --paginate repos/jhonnyisaacc/davar/pulls/comments?per_page=100`: **141** comments. Authors: Copilot 121, cursor[bot] 15, jhonnyisaacc 5. Keyword samples in `agent_history.json` (40 kept) repeat a few classes:

- Hardcoded machine paths and env files that do not match the example (`backend/app/config.py` on PRs 11 and 12). `backend/` is not a top-level directory in `inventory.json` on this branch; the comments are history from before this layout.
- Duplicate controls in one screen (cursor[bot] on PR 13, `web/src/app/components/NavigationBar.tsx`, Hebrew Only toggle twice).
- Ref timing: Copilot on PR 27, `WordAnalysisBottomSheet` `useImperativeHandle` leaving `ref.current` null when `VerseDetailContent` calls `snapToIndex`.
- Case-sensitive data filenames (Copilot on PR 29, `data/bes/json/...`).

Draft PR #250 (`gh pr view 250`): open, draft, base `main`, head `feat/davar-v2`, author `jhonnyisaacc`, 0 reviews, 1 issue comment. It is the branch this review is based on, not a review of this review.

Mistake-history score: **1**. The raw material is in git and in those 141 comments. Nothing in the repo turns a repeated class into a lint rule or a row in `AGENTS.md`. Cloud transcripts for past runs were not available here.
