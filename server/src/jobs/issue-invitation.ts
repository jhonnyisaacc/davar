import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { issueInvitation } from "../services/operators.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl);
try {
	const code = await issueInvitation(db);
	console.log(code);
} finally {
	await sql.end();
}
