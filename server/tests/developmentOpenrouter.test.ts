import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/lib/config.js";
import { developmentOpenrouter } from "../src/services/provider.js";

function openrouterEnv(nodeEnv: string, model = "fixture/model:free"): NodeJS.ProcessEnv {
	return {
		NODE_ENV: nodeEnv,
		OPENROUTER_API_KEY: "development-test-key",
		OPENROUTER_MODEL: model,
	};
}

describe("development OpenRouter", () => {
	test("a key and a free model enable it only in development", () => {
		const development = openrouterEnv("development");
		expect(developmentOpenrouter(development)).toBe(true);
		expect(developmentOpenrouter({ ...development, OPENROUTER_MODEL: "openrouter/free" })).toBe(true);
		expect(developmentOpenrouter({ ...development, OPENROUTER_MODEL: "fixture/model" })).toBe(false);

		for (const blank of [undefined, "", " "]) {
			expect(developmentOpenrouter({ ...development, OPENROUTER_API_KEY: blank })).toBe(false);
			expect(developmentOpenrouter({ ...development, OPENROUTER_MODEL: blank })).toBe(false);
		}

		expect(developmentOpenrouter(openrouterEnv("test"))).toBe(false);
	});

	test("hosted boots keep development OpenRouter off", () => {
		for (const name of ["staging", "production"] as const) {
			const hosted = {
				...openrouterEnv(name),
				DATABASE_URL: `postgresql://127.0.0.1/davar_v2_${name}`,
				DAVAR_ENCRYPTION_PRIMARY_KEY: "a".repeat(32),
				DAVAR_ENCRYPTION_DETERMINISTIC_KEY: "b".repeat(32),
				API_PUBLIC_URL: `https://api.${name}.example.org`,
				API_HOSTS: `api.${name}.example.org`,
			};
			const config = loadConfig(hosted);
			expect(config.env).toBe(name);
			expect(config.allowedHosts).toEqual([`api.${name}.example.org`]);
			expect(developmentOpenrouter(hosted)).toBe(false);
			expect(developmentOpenrouter({ ...hosted, OPENROUTER_MODEL: "fixture/model" })).toBe(false);
		}
	});
});
