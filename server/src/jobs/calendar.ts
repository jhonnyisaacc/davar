import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { calendarPayload, syncObservations } from "../services/sync.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	const payload = calendarPayload(process.env);
	if (payload.kind === "skip") {
		console.log(
			JSON.stringify({
				job: "sync_calendar_observations",
				status: "skipped",
				reason: payload.reason,
			}),
		);
	} else {
		const file = payload.path;
		const result = await syncObservations(db, {
			env: process.env,
			fetcher: async () => Bun.file(file).text(),
		});
		console.log(JSON.stringify({ job: "sync_calendar_observations", ...result }));
	}
} finally {
	await sql.end();
}
