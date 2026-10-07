# Feature map

Five features and the command that checks each one. Every command already exists on this branch. Control commands are `scripts/control/web.ts`, `scripts/control/server.ts`, `scripts/control/worker.ts`, and `scripts/control/mobile.ts`.

Run a `scripts/control` command from the repository root. For the verse route, run `bun scripts/control/web.ts start` first. Run each `bun test` from the directory in that row.

| Feature | Behavior | Check |
| --- | --- | --- |
| Read a verse | The web route renders Hebrew from static JSON. | `bun scripts/control/web.ts drive open /verse/Genesis/1/1` |
| Word card | Selecting a token opens the lexicon card. | `cd web && bun test src/app/services/staticData.loading.test.ts` |
| Calendar | `GET /api/v1/calendar/upcoming` returns the documented keys. | `cd server && bun test tests/calendar.test.ts` |
| Assemblies | A signed-in client can list assemblies. | `cd server && bun test tests/assemblies.test.ts` |
| Commentary | The commentary screen loads for a verse reference. | `cd web && bun test src/app/features/commentary/CommentaryScreen.test.tsx` |

## What passing looks like

- **Read a verse.** The opened URL contains `/verse/Genesis/1/1` and the page has text. That route is the reader. It renders the Hebrew loaded from static JSON under `/data`.
- **Word card.** `single-word lookup fetches the Strong shard instead of full dictionaries` loads lexicon entry `H430` through `loadLexiconEntry`. Selecting a token calls that loader and opens `WordCard`.
- **Calendar.** `upcoming honors the day count` requests `GET /api/v1/calendar/upcoming` and expects status 200 and a `days` array. The same file's today case asserts `schema_version`, `civil_date`, `month_status`, `year_start_status`, and `rabbinic` on that calendar document.
- **Assemblies.** `online index and validation` and `online index returns id order` send `GET /api/v1/assemblies?kind=online` with a signed-in reader's headers and expect an `assemblies` array.
- **Commentary.** The file renders `CommentaryScreen`. The screen takes a verse `context` and sends that reference with the consultation.
