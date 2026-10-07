import { readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { loadConfig } from "../lib/config.js";
import { MIGRATIONS_DIR } from "./pending.js";

async function main(): Promise<void> {
	const config = loadConfig();
	if (!config.databaseUrl) throw new Error("DATABASE_URL is required to migrate");
	const sql = postgres(config.databaseUrl, { max: 1 });
	try {
		await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
		const files = (await readdir(MIGRATIONS_DIR))
			.filter((file) => file.endsWith(".sql"))
			.sort();
		const applied = new Set(
			(await sql`SELECT name FROM schema_migrations`).map((row) => row.name as string),
		);
		for (const file of files) {
			if (applied.has(file)) {
				console.log(`skip ${file}`);
				continue;
			}
			const statement = await Bun.file(join(MIGRATIONS_DIR, file)).text();
			await sql.unsafe(statement);
			await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
			console.log(`applied ${file}`);
		}
	} finally {
		await sql.end();
	}
}

await main();
