import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { logDevelopmentJob } from "../lib/jobLog.js";
import { recoverConsultations } from "../services/recover.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	logDevelopmentJob(config.env, "recover_consultations", "src/jobs/recover.ts");
	const result = await recoverConsultations(db, config.encryptionPrimaryKey);
	console.log(JSON.stringify({ job: "recover_consultations", ...result }));
} finally {
	await sql.end();
}
