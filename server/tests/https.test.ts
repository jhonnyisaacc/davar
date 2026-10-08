import { describe, expect, test } from "bun:test";
import { createApp } from "../src/http/app.js";
import type { AppDeps } from "../src/http/deps.js";
import type { ServerConfig } from "../src/lib/config.js";

const HSTS = "max-age=15552000; includeSubDomains";

function config(partial: Partial<ServerConfig> = {}): ServerConfig {
	return {
		env: "test",
		databaseUrl: undefined,
		poolSize: 10,
		apiPublicUrl: "http://localhost:3000",
		authReturnUris: ["davar://auth/callback"],
		webOrigins: [],
		allowedHosts: [],
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

describe("https security", () => {
	test("redirects to https when the proxy saw http", async () => {
		const app = appFor();
		const res = await app.request("http://127.0.0.1:3000/up?q=1", {
			headers: {
				host: "api.example.test",
				"x-forwarded-proto": "http",
			},
		});
		expect(res.status).toBe(301);
		expect(res.headers.get("Location")).toBe("https://api.example.test/up?q=1");

		const withPort = await app.request("http://127.0.0.1:3000/up", {
			headers: { host: "api.example.test:8443", "x-forwarded-proto": "http" },
		});
		expect(withPort.status).toBe(301);
		expect(withPort.headers.get("Location")).toBe("https://api.example.test:8443/up");
	});

	test("uses the first forwarded protocol", async () => {
		const app = appFor();
		const httpFirst = await app.request("http://127.0.0.1:3000/up", {
			headers: { host: "api.example.test", "x-forwarded-proto": "HTTP, https" },
		});
		expect(httpFirst.status).toBe(301);
		expect(httpFirst.headers.get("Location")).toBe("https://api.example.test/up");

		const httpsFirst = await app.request("http://127.0.0.1:3000/up", {
			headers: { host: "api.example.test", "x-forwarded-proto": "https, http" },
		});
		expect(httpsFirst.status).toBe(200);
		expect(httpsFirst.headers.get("Location")).toBe(null);
	});

	test("leaves direct local http in place and sets HSTS", async () => {
		const app = appFor();
		const res = await app.request("http://127.0.0.1:3000/up");
		expect(res.status).toBe(200);
		expect(res.headers.get("Location")).toBe(null);
		expect(res.headers.get("Strict-Transport-Security")).toBe(HSTS);
		expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
		expect(await res.json()).toEqual({ status: "ok" });
	});

	test("sets HSTS when the proxy already terminated https", async () => {
		const app = appFor();
		const res = await app.request("http://127.0.0.1:3000/up", {
			headers: { host: "api.example.test", "x-forwarded-proto": "https" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Strict-Transport-Security")).toBe(HSTS);
	});

	test("does not redirect a host the allowlist rejects", async () => {
		const app = appFor({ env: "production", allowedHosts: ["api.example.test"] });
		const res = await app.request("http://127.0.0.1:3000/up", {
			headers: { host: "evil.example.test", "x-forwarded-proto": "http" },
		});
		expect(res.status).toBe(403);
		expect(res.headers.get("Location")).toBe(null);
		expect(await res.json()).toEqual({ error: { code: "forbidden_host" } });
	});
});
