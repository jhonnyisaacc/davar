import { createDb, type DatabaseOrTx } from "../db/client.js";
import { loadConfig } from "../lib/config.js";
import { fixtureCalendar, type FixtureKeys } from "../services/fixtures.js";
import { calendarPayload, syncObservations } from "../services/sync.js";

export function calendarScenarioFromArgs(args: readonly string[]): string {
	return args[0] ?? "live";
}

export async function runSandboxCalendar(
	db: DatabaseOrTx,
	keys: FixtureKeys,
	scenario: string,
	env: NodeJS.ProcessEnv = process.env,
) {
	const calendar = await fixtureCalendar(db, keys, scenario);
	if (scenario !== "live") return { calendar };
	const payload = calendarPayload(env);
	if (payload.kind === "skip") {
		return {
			calendar,
			sync: {
				job: "sync_calendar_observations",
				status: "skipped" as const,
				reason: payload.reason,
			},
		};
	}
	const result = await syncObservations(db, {
		env,
		fetcher: async () => Bun.file(payload.path).text(),
	});
	return { calendar, sync: { job: "sync_calendar_observations", ...result } };
}

if (import.meta.main) {
	const config = loadConfig();
	const { sql, db } = createDb(config.databaseUrl, config.poolSize);
	try {
		const scenario = calendarScenarioFromArgs(process.argv.slice(2));
		const outcome = await runSandboxCalendar(
			db,
			{
				primaryKey: config.encryptionPrimaryKey,
				deterministicKey: config.encryptionDeterministicKey,
				env: process.env,
				nodeEnv: process.env.NODE_ENV ?? "development",
				rootDir: process.cwd(),
			},
			scenario,
			process.env,
		);
		console.log(JSON.stringify(outcome.calendar, null, 2));
		if (outcome.sync) console.log(JSON.stringify(outcome.sync));
	} finally {
		await sql.end();
	}
}
