import { decryptionKeys, loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { verifyLeader } from "../services/operators.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl, config.poolSize);
try {
	const userId = process.env.USER_ID;
	if (userId === undefined) throw new Error("USER_ID is required");
	await verifyLeader(db, userId, decryptionKeys(config));
} finally {
	await sql.end();
}
