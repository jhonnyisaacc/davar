import { loadConfig } from "../lib/config.js";
import { createDb } from "../db/client.js";
import { fixtureCalendar, resetFixtures } from "../services/fixtures.js";

const config = loadConfig();
const { sql, db } = createDb(config.databaseUrl, config.poolSize);
try {
	const keys = {
		primaryKey: config.encryptionPrimaryKey,
		deterministicKey: config.encryptionDeterministicKey,
		env: process.env,
		nodeEnv: process.env.NODE_ENV ?? "development",
		rootDir: process.cwd(),
	};
	const scenario = process.env.SCENARIO;
	if (scenario) {
		console.log(JSON.stringify(await fixtureCalendar(db, keys, scenario), null, 2));
	} else {
		console.log(JSON.stringify(await resetFixtures(db, keys), null, 2));
	}
} finally {
	await sql.end();
}
