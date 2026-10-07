import { loadConfig } from "./lib/config.js";
import { dbFromEnv } from "./db/client.js";
import { createApp } from "./http/app.js";
import type { AppDeps } from "./http/deps.js";

const config = loadConfig();
const { db } = dbFromEnv();

const deps: AppDeps = {
	db,
	config,
	env: process.env,
	rootDir: process.cwd(),
};

const app = createApp(deps);

export default {
	port: config.port,
	fetch: app.fetch,
};

console.log(`Davar API (Bun + Hono) listening on port ${config.port}`);
