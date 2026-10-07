import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { logDevelopmentJob } from "../lib/jobLog.js";
import { deliverTelegramNotifications } from "../services/notify.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	logDevelopmentJob(config.env, "telegram_notifications", "src/jobs/notify.ts");
	const result = await deliverTelegramNotifications(db, {
		env: process.env,
		primaryKey: config.encryptionPrimaryKey,
		previousKeys: config.encryptionPreviousKeys,
	});
	console.log(JSON.stringify({ job: "telegram_notifications", ...result }));
} finally {
	await sql.end();
}
