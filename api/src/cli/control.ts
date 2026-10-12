import { createDb, type DbHandle } from "../db/client.js";
import { isJobName, JOBS, type JobName } from "../jobs/functions.js";
import { loadConfig } from "../lib/config.js";
import { emptyState, tick } from "../scheduler.js";
import { fetchFeed, syncObservations, type SyncReport } from "../services/sync.js";

const USAGE = [
	"usage: bun scripts/control/index.ts import inms [--fixture <path>]",
	"       bun scripts/control/index.ts job <name>",
	"       bun scripts/control/index.ts job tick",
].join("\n");

export type ControlArgs =
	| { ok: true; kind: "import"; fixture?: string }
	| { ok: true; kind: "job"; name: JobName }
	| { ok: true; kind: "tick" }
	| { ok: false; usage: string };

export function parseControlArgs(argv: string[]): ControlArgs {
	if (argv[0] === "job") {
		const name = argv[1];
		if (argv.length === 2 && name === "tick") return { ok: true, kind: "tick" };
		if (argv.length === 2 && name && isJobName(name)) return { ok: true, kind: "job", name };
		return { ok: false, usage: USAGE };
	}
	if (argv[0] !== "import" || argv[1] !== "inms") return { ok: false, usage: USAGE };
	const rest = argv.slice(2);
	if (rest.length === 0) return { ok: true, kind: "import" };
	const fixture = rest[1];
	if (rest.length === 2 && rest[0] === "--fixture" && fixture && !fixture.startsWith("-")) {
		return { ok: true, kind: "import", fixture };
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

function asRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object") return { ...(value as Record<string, unknown>) };
	return { result: value };
}

export async function runControl(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
	const parsed = parseControlArgs(argv);
	if (!parsed.ok) {
		console.error(parsed.usage);
		return 1;
	}
	let handle: DbHandle | undefined;
	try {
		const config = loadConfig(env);
		handle = createDb(config.databaseUrl, config.poolSize);
		if (parsed.kind === "import") {
			const report = await runInmsImport(handle.db, { fixture: parsed.fixture, env });
			console.log(JSON.stringify(report));
			return report.status === "source_unavailable" ? 1 : 0;
		}
		const deps = {
			db: handle.db,
			env,
			primaryKey: config.encryptionPrimaryKey,
			previousKeys: config.encryptionPreviousKeys,
		};
		if (parsed.kind === "tick") {
			const result = await tick(Date.now(), emptyState(), deps);
			console.log(JSON.stringify({ ran: result.ran, failed: result.failed }));
			return result.failed.length > 0 ? 1 : 0;
		}
		const result = await JOBS[parsed.name]({ ...deps, now: new Date() });
		console.log(JSON.stringify({ job: parsed.name, ...asRecord(result) }));
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : "command_failed";
		const status = parsed.kind === "import" ? "source_unavailable" : "failed";
		console.log(JSON.stringify({ status, error: message }));
		return 1;
	} finally {
		await handle?.sql.end();
	}
}
