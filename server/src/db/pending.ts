import { readdir } from "node:fs/promises";
import type postgres from "postgres";
import type { AppEnv } from "../lib/config.js";
import { pgErrorCode } from "../lib/pgErrors.js";

export const MIGRATIONS_DIR = new URL("../../drizzle/", import.meta.url).pathname;

export class PendingMigrationError extends Error {
	readonly code = "pending_migration";
	readonly pending: readonly string[];

	constructor(pending: readonly string[]) {
		super(`Migrations are pending: ${pending.join(", ")}. Run bun run db:migrate.`);
		this.name = "PendingMigrationError";
		this.pending = pending;
	}
}

export async function pendingMigrationNames(
	sql: postgres.Sql,
	directory: string = MIGRATIONS_DIR,
): Promise<string[]> {
	const files = (await readdir(directory))
		.filter((file) => file.endsWith(".sql"))
		.sort();
	try {
		const applied = new Set(
			(await sql`SELECT name FROM schema_migrations`).map((row) => String(row.name)),
		);
		return files.filter((file) => !applied.has(file));
	} catch (error) {
		if (pgErrorCode(error) === "42P01") return files;
		throw error;
	}
}

export async function assertMigrationsApplied(
	env: AppEnv,
	sql: postgres.Sql,
	directory: string = MIGRATIONS_DIR,
): Promise<void> {
	if (env !== "development") return;
	const pending = await pendingMigrationNames(sql, directory);
	if (pending.length > 0) throw new PendingMigrationError(pending);
}
