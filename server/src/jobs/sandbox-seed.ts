import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { seedFixtures } from "../services/fixtures.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl, config.poolSize);
try {
	const result = await seedFixtures(db, {
		primaryKey: config.encryptionPrimaryKey,
		deterministicKey: config.encryptionDeterministicKey,
		env: process.env,
		nodeEnv: process.env.NODE_ENV ?? "development",
		rootDir: process.cwd(),
	});
	console.log(JSON.stringify(result, null, 2));
} finally {
	await sql.end();
}
