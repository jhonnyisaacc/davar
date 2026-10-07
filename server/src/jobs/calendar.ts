import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { syncObservations } from "../services/sync.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	const result = await syncObservations(db, {
		env: process.env,
		fetcher: process.env.IMPORT_FILE
			? async () => Bun.file(process.env.IMPORT_FILE as string).text()
			: undefined,
	});
	console.log(JSON.stringify({ job: "sync_calendar_observations", ...result }));
} finally {
	await sql.end();
}
