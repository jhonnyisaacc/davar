import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/lib/config.js";

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
	});

	test("staging and production require keys, database and https", async () => {
		for (const env of ["staging", "production"] as const) {
			const good = {
				NODE_ENV: env,
				DATABASE_URL: `postgresql://127.0.0.1/davar_v2_${env}`,
				DAVAR_ENCRYPTION_PRIMARY_KEY: "a".repeat(32),
				DAVAR_ENCRYPTION_DETERMINISTIC_KEY: "b".repeat(32),
				API_PUBLIC_URL: `https://api.${env}.example.org`,
			};
			const config = loadConfig(base(good));
			expect(config.env).toBe(env);
			expect(config.apiPublicUrl).toBe(`https://api.${env}.example.org`);

			expect(() =>
				loadConfig(base({ ...good, DAVAR_ENCRYPTION_PRIMARY_KEY: undefined })),
			).toThrow("DAVAR_ENCRYPTION_PRIMARY_KEY is required");
			expect(() => loadConfig(base({ ...good, DATABASE_URL: undefined }))).toThrow(
				`Missing ${env} configuration: DATABASE_URL`,
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
