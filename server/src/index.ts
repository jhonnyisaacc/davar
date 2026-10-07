import { loadConfig } from "./lib/config.js";
import { dbFromEnv } from "./db/client.js";
import { assertMigrationsApplied, pendingMigrationNames } from "./db/pending.js";
import { createApp } from "./http/app.js";
import type { AppDeps } from "./http/deps.js";

const config = loadConfig();
const { db, sql } = dbFromEnv(config);
await assertMigrationsApplied(config.env, sql);

const deps: AppDeps = {
	db,
	config,
	env: process.env,
	rootDir: process.cwd(),
	...(config.env === "development"
		? { pendingMigrations: () => pendingMigrationNames(sql) }
		: {}),
};

const app = createApp(deps);

export default {
	port: config.port,
	// Bun passes the server as the second fetch argument, which Hono exposes
	// as c.env — clientIp uses it for the real socket address (remote_ip).
	fetch: (req: Request, server: unknown) => app.fetch(req, server as never),
};

console.log(`Davar API (Bun + Hono) listening on port ${config.port}`);
