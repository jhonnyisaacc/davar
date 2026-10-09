import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { recoverConsultationsJob } from "./functions.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl, config.poolSize);
try {
	const result = await recoverConsultationsJob({
		db,
		env: process.env,
		now: new Date(),
		primaryKey: config.encryptionPrimaryKey,
		previousKeys: config.encryptionPreviousKeys,
	});
	console.log(JSON.stringify({ job: "recover_consultations", ...result }));
} finally {
	await sql.end();
}
