import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { articleImport } from "../services/imports.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	const file = process.env.IMPORT_FILE;
	if (!file) throw new Error("IMPORT_FILE is required");
	const payload = JSON.parse(await Bun.file(file).text());
	const report = await articleImport(
		db,
		payload,
		{
			primaryKey: config.encryptionPrimaryKey,
			deterministicKey: config.encryptionDeterministicKey,
		},
		process.env.APPLY !== "1",
	);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await sql.end();
}
