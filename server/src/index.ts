import { loadConfig, type ServerConfig } from "./lib/config.js";
import { createDb } from "./db/client.js";
import { createApp } from "./http/app.js";
import type { AppDeps } from "./http/deps.js";

function bootConfig(): ServerConfig {
	try {
		return loadConfig();
	} catch (error) {
		console.error(error instanceof Error ? error.message : "Invalid server environment");
		process.exit(1);
	}
}

const config = bootConfig();
const { db } = createDb(config.databaseUrl, config.poolSize);

const deps: AppDeps = {
	db,
	config,
	env: process.env,
	rootDir: process.cwd(),
};

const app = createApp(deps);

export default {
	port: config.port,
	// Bun passes the server as the second fetch argument, which Hono exposes
	// as c.env — clientIp uses it for the real socket address (remote_ip).
	fetch: (req: Request, server: unknown) => app.fetch(req, server as never),
};

console.log(`Davar API (Bun + Hono) listening on port ${config.port}`);
