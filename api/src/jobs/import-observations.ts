import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { observationImport } from "../services/imports.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl, config.poolSize);
try {
	const file = process.env.IMPORT_FILE;
	if (!file) throw new Error("IMPORT_FILE is required");
	const payload = JSON.parse(await Bun.file(file).text());
	const report = await observationImport(db, payload, process.env.APPLY !== "1");
	console.log(JSON.stringify(report, null, 2));
} finally {
	await sql.end();
}
