import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadConfig, type ServerConfig } from "../lib/config.js";
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

export function createDb(databaseUrl: string | undefined): DbHandle {
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required");
	}
	const sql = postgres(databaseUrl, { max: 10 });
	return { sql, db: drizzle(sql, { schema }) };
}

export function dbFromEnv(): DbHandle {
	return createDb(loadConfig().databaseUrl);
}

export interface Ctx {
	db: DatabaseOrTx;
	config: ServerConfig;
}
