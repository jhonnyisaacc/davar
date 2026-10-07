import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadConfig, type ServerConfig } from "../lib/config.js";
import { formatQueryLog } from "../lib/queryLog.js";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseOrTx = Database | PostgresJsTransaction;

type PostgresJsTransaction = Parameters<
	Parameters<Database["transaction"]>[0]
>[0];

export interface DbHandle {
	sql: postgres.Sql;
	db: Database;
}

// Runs fn in a nested transaction. Inside an outer transaction this is a
// Postgres savepoint: a unique violation (or any statement failure) rolls
// back only this block, so the caller can catch and retry. Rule: no
// external I/O inside DB transactions, and retries of failed statements
// must always go through this helper.
export async function withSavepoint<T>(
	db: DatabaseOrTx,
	fn: (tx: DatabaseOrTx) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => fn(tx as DatabaseOrTx));
}

export function createDb(
	databaseUrl: string | undefined,
	options?: { verboseQueryLogs?: boolean },
): DbHandle {
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required");
	}
	const verbose =
		options?.verboseQueryLogs ??
		(process.env.NODE_ENV ?? "development") === "development";
	const sql = postgres(databaseUrl, {
		max: 10,
		...(verbose
			? {
					debug: (
						_connection: number,
						query: string,
						_parameters: unknown[],
						_paramTypes: unknown[],
					) => {
						console.log(formatQueryLog(query));
					},
				}
			: {}),
	});
	return { sql, db: drizzle(sql, { schema }) };
}

export function dbFromEnv(config: ServerConfig = loadConfig()): DbHandle {
	return createDb(config.databaseUrl, {
		verboseQueryLogs: config.env === "development",
	});
}

export interface Ctx {
	db: DatabaseOrTx;
	config: ServerConfig;
}
