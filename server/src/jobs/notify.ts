import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { deliverTelegramNotifications } from "../services/notify.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	const result = await deliverTelegramNotifications(db, {
		env: process.env,
		primaryKey: config.encryptionPrimaryKey,
	});
	console.log(JSON.stringify({ job: "telegram_notifications", ...result }));
} finally {
	await sql.end();
}
