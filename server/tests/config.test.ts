import { describe, expect, test } from "bun:test";
import { loadConfig, serverEnvSchema } from "../src/lib/config.js";

function base(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
	return {
		NODE_ENV: "test",
		...extra,
	} as NodeJS.ProcessEnv;
}

describe("environment configuration", () => {
	test("development boots with local defaults", async () => {
		const config = loadConfig(base({}));
		expect(config.env).toBe("test");
		expect(config.apiPublicUrl).toBe("http://localhost:3000");
		expect(config.authReturnUris).toEqual(["davar://auth/callback"]);
		expect(config.port).toBe(3000);
		expect(config.poolSize).toBe(5);
		expect(config.allowedHosts).toEqual([]);
	});

	test("pool size and host allowlist are read from the environment", async () => {
		const config = loadConfig(
			base({
				DATABASE_POOL_SIZE: "4",
				API_HOSTS: " API.Example.Test:443 , localhost , ::1 ",
			}),
		);
		expect(config.poolSize).toBe(4);
		expect(config.allowedHosts).toEqual(["api.example.test", "localhost", "::1"]);
	});

	test("an invalid pool size fails closed", () => {
		expect(() => loadConfig(base({ DATABASE_POOL_SIZE: "0" }))).toThrow(
			"DATABASE_POOL_SIZE must be a positive integer",
		);
	});

	test("the env schema rejects a hosted boot that omits API_HOSTS", async () => {
		const hosted = {
			NODE_ENV: "production",
			DATABASE_URL: "postgresql://127.0.0.1/davar_v2_production",
			DAVAR_ENCRYPTION_PRIMARY_KEY: "a".repeat(32),
			DAVAR_ENCRYPTION_DETERMINISTIC_KEY: "b".repeat(32),
			API_PUBLIC_URL: "https://api.example.org",
			API_HOSTS: "api.example.org",
		};
		const ok = serverEnvSchema.safeParse(hosted);
		expect(ok.success).toBe(true);

		const missing = serverEnvSchema.safeParse({ ...hosted, API_HOSTS: "" });
		expect(missing.success).toBe(false);
		if (!missing.success) {
			expect(missing.error.issues[0]?.message).toBe(
				"Missing production configuration: API_HOSTS",
			);
		}
		expect(() => loadConfig(base(hosted) as NodeJS.ProcessEnv)).not.toThrow();
		expect(() => loadConfig(base({ ...hosted, API_HOSTS: "" }))).toThrow(
			"Missing production configuration: API_HOSTS",
		);
	});

	test("return URIs trim entries and drop empties", async () => {
		const config = loadConfig(
			base({ AUTH_RETURN_URIS: " davar://auth/callback ,, https://app.example.test " }),
		);
		expect(config.authReturnUris).toEqual([
			"davar://auth/callback",
			"https://app.example.test",
		]);
	});

	test("non-local databases fail closed without real keys", async () => {
		const remote = {
			DATABASE_URL: "postgresql://db.example.org/davar",
			API_PUBLIC_URL: "http://localhost:3000",
		};
		expect(() => loadConfig(base(remote))).toThrow(
			"Refuses default encryption keys with a non-local DATABASE_URL",
		);
		const local = loadConfig(
			base({ DATABASE_URL: "postgresql://127.0.0.1:5432/davar" }),
		);
		expect(local.env).toBe("test");
	});

	test("staging and production require keys, database and https", async () => {
		for (const env of ["staging", "production"] as const) {
			const good = {
				NODE_ENV: env,
				DATABASE_URL: `postgresql://127.0.0.1/davar_v2_${env}`,
				DAVAR_ENCRYPTION_PRIMARY_KEY: "a".repeat(32),
				DAVAR_ENCRYPTION_DETERMINISTIC_KEY: "b".repeat(32),
				API_PUBLIC_URL: `https://api.${env}.example.org`,
				API_HOSTS: `api.${env}.example.org`,
			};
			const config = loadConfig(base(good));
			expect(config.env).toBe(env);
			expect(config.apiPublicUrl).toBe(`https://api.${env}.example.org`);
			expect(config.allowedHosts).toEqual([`api.${env}.example.org`]);

			expect(() =>
				loadConfig(base({ ...good, DAVAR_ENCRYPTION_PRIMARY_KEY: undefined })),
			).toThrow("DAVAR_ENCRYPTION_PRIMARY_KEY is required");
			expect(() => loadConfig(base({ ...good, DATABASE_URL: undefined }))).toThrow(
				`Missing ${env} configuration: DATABASE_URL`,
			);
			expect(() => loadConfig(base({ ...good, API_HOSTS: undefined }))).toThrow(
				`Missing ${env} configuration: API_HOSTS`,
			);
			expect(() =>
				loadConfig(base({ ...good, API_PUBLIC_URL: `http://api.${env}.example.org` })),
			).toThrow(`API_PUBLIC_URL must use HTTPS in ${env}`);
			expect(() => loadConfig(base({ ...good, DAVAR_DEV_SANDBOX: "1" }))).toThrow(
				"DAVAR_DEV_SANDBOX is development-only",
			);
		}
	});
});
