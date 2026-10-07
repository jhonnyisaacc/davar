import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { syncCalendarObservations } from "../services/calendarSync.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	const file = process.env.IMPORT_FILE;
	const payload = file ? JSON.parse(await Bun.file(file).text()) : null;
	const result = await syncCalendarObservations(db, {
		payload,
		apply: process.env.APPLY === "1",
	});
	console.log(JSON.stringify({ job: "sync_calendar_observations", ...result }));
} finally {
	await sql.end();
}
