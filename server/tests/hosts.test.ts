import { describe, expect, test } from "bun:test";
import { createApp } from "../src/http/app.js";
import type { AppDeps } from "../src/http/deps.js";
import type { ServerConfig } from "../src/lib/config.js";

function config(partial: Partial<ServerConfig> = {}): ServerConfig {
	return {
		env: "production",
		databaseUrl: undefined,
		poolSize: 10,
		apiPublicUrl: "https://api.example.test",
		authReturnUris: ["davar://auth/callback"],
		webOrigins: [],
		allowedHosts: ["api.example.test"],
		trustedProxies: [],
		sandbox: false,
		encryptionPrimaryKey: "test-primary",
		encryptionPreviousKeys: [],
		encryptionDeterministicKey: "test-deterministic",
		port: 3000,
		...partial,
	};
}

function appFor(partial: Partial<ServerConfig> = {}) {
	const deps: AppDeps = {
		db: {} as AppDeps["db"],
		config: config(partial),
		env: {},
	};
	return createApp(deps);
}

describe("host allowlist", () => {
	test("allows a configured host and rejects the rest", async () => {
		const app = appFor();
		const ok = await app.request("http://api.example.test/up", {
			headers: { host: "api.example.test" },
		});
		expect(ok.status).toBe(200);

		const denied = await app.request("http://evil.example.test/up", {
			headers: { host: "evil.example.test" },
		});
		expect(denied.status).toBe(403);
		expect(await denied.json()).toEqual({ error: { code: "forbidden_host" } });

		const missing = await app.request("http://api.example.test/up");
		expect(missing.status).toBe(403);
	});

	test("allows an IPv6 host written with brackets and a port", async () => {
		const app = appFor({ allowedHosts: ["::1"] });
		const res = await app.request("http://[::1]/up", {
			headers: { host: "[::1]:3000" },
		});
		expect(res.status).toBe(200);
	});

	test("matches hosts case-insensitively and ignores the port", async () => {
		const app = appFor();
		const res = await app.request("http://api.example.test:8443/up", {
			headers: { host: "API.Example.Test:8443" },
		});
		expect(res.status).toBe(200);
	});

	test("an empty list is open in development and test, closed when hosted", async () => {
		const open = await appFor({ env: "test", allowedHosts: [] }).request(
			"http://evil.example.test/up",
			{ headers: { host: "evil.example.test" } },
		);
		expect(open.status).toBe(200);

		const dev = await appFor({ env: "development", allowedHosts: [] }).request(
			"http://localhost:3000/up",
			{ headers: { host: "localhost:3000" } },
		);
		expect(dev.status).toBe(200);

		const closed = await appFor({ env: "production", allowedHosts: [] }).request(
			"http://api.example.test/up",
			{ headers: { host: "api.example.test" } },
		);
		expect(closed.status).toBe(403);
	});
});
