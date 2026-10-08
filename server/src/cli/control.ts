import { createDb, type DbHandle } from "../db/client.js";
import { loadConfig } from "../lib/config.js";
import { fetchFeed, syncObservations, type SyncReport } from "../services/sync.js";

const USAGE = "usage: bun scripts/control/index.ts import inms [--fixture <path>]";

export type ControlArgs =
	| { ok: true; fixture?: string }
	| { ok: false; usage: string };

export function parseControlArgs(argv: string[]): ControlArgs {
	if (argv[0] !== "import" || argv[1] !== "inms") return { ok: false, usage: USAGE };
	const rest = argv.slice(2);
	if (rest.length === 0) return { ok: true };
	const fixture = rest[1];
	if (rest.length === 2 && rest[0] === "--fixture" && fixture && !fixture.startsWith("-")) {
		return { ok: true, fixture };
	}
	return { ok: false, usage: USAGE };
}

export async function runInmsImport(
	db: Parameters<typeof syncObservations>[0],
	input: { fixture?: string; env?: NodeJS.ProcessEnv },
): Promise<SyncReport> {
	const env = input.env ?? process.env;
	if (input.fixture) {
		const rssXml = await Bun.file(input.fixture).text();
		return syncObservations(db, { rssXml, env });
	}
	return syncObservations(db, { fetcher: () => fetchFeed(env), env });
}

export async function runControl(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
	const parsed = parseControlArgs(argv);
	if (!parsed.ok) {
		console.error(parsed.usage);
		return 1;
	}
	let handle: DbHandle | undefined;
	try {
		handle = createDb(loadConfig(env).databaseUrl);
		const report = await runInmsImport(handle.db, { fixture: parsed.fixture, env });
		console.log(JSON.stringify(report));
		return report.status === "source_unavailable" ? 1 : 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : "import_failed";
		console.log(JSON.stringify({ status: "source_unavailable", error: message }));
		return 1;
	} finally {
		await handle?.sql.end();
	}
}
