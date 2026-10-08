import { afterEach, describe, expect, test } from "bun:test";
import { DomainError } from "../src/lib/errors.js";
import {
	CLOSED_FLAGS,
	FLAG_KEYS,
	clearFlagCache,
	evaluateFlags,
	type FlagSet,
} from "../src/services/flags.js";
import type { ProviderHttp } from "../src/services/oauth.js";

const OPEN_FLAGS: FlagSet = {
	ai_provider_connections: true,
	ai_shared_openrouter: true,
	assemblies: true,
};

const PRIVATE_NAME = "Private name";

function enabledPayload(): { flags: Record<string, { enabled: boolean }> } {
	return {
		flags: Object.fromEntries(FLAG_KEYS.map((key) => [key, { enabled: true }])),
	};
}

function posthogEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
	return {
		NODE_ENV: "test",
		POSTHOG_PROJECT_TOKEN: "test-project-token",
		POSTHOG_HOST: "https://us.i.posthog.com",
		...extra,
	};
}

afterEach(() => {
	clearFlagCache();
});

describe("PostHog feature flags", () => {
	test("evaluation is bounded and cached by account and environment without personal content", async () => {
		const originalNow = Date.now;
		let now = 1_700_000_000_000;
		Date.now = () => now;
		const requests: Array<{ url: string; options?: Parameters<ProviderHttp["json"]>[1] }> = [];
		let payload: unknown = enabledPayload();
		const http: ProviderHttp = {
			async json(url, options) {
				requests.push({ url, options });
				if (payload instanceof Error) throw payload;
				return payload;
			},
		};
		const env = posthogEnv();
		const userId = "user-1";
		try {
			expect(await evaluateFlags(userId, { env, http })).toEqual(OPEN_FLAGS);
			expect(await evaluateFlags(userId, { env, http })).toEqual(OPEN_FLAGS);
			expect(requests).toHaveLength(1);
			const request = requests[0];
			expect(request?.url).toBe("https://us.i.posthog.com/flags?v=2");
			expect(request?.options?.method).toBe("post");
			expect(request?.options?.openTimeoutMs).toBe(2000);
			expect(request?.options?.readTimeoutMs).toBe(3000);
			expect(request?.options?.body).toEqual({
				api_key: "test-project-token",
				distinct_id: `davar/${userId}`,
				person_properties: { environment: "test" },
				flag_keys_to_evaluate: [...FLAG_KEYS],
				disable_geoip: true,
			});
			expect(JSON.stringify(request?.options?.body)).not.toContain(PRIVATE_NAME);

			expect(await evaluateFlags("user-2", { env, http })).toEqual(OPEN_FLAGS);
			expect(requests).toHaveLength(2);
			expect(requests[1]?.options?.body).toMatchObject({ distinct_id: "davar/user-2" });

			const production = posthogEnv({ NODE_ENV: "production" });
			expect(await evaluateFlags(userId, { env: production, http })).toEqual(OPEN_FLAGS);
			expect(requests).toHaveLength(3);
			expect(requests[2]?.options?.body).toMatchObject({
				person_properties: { environment: "production" },
			});

			now += 29_000;
			payload = { flags: {} };
			expect(await evaluateFlags(userId, { env, http })).toEqual(OPEN_FLAGS);
			expect(requests).toHaveLength(3);

			now += 2_000;
			expect(await evaluateFlags(userId, { env, http })).toEqual(CLOSED_FLAGS);
			expect(requests).toHaveLength(4);
		} finally {
			Date.now = originalNow;
		}
	});

	test("missing configuration, errors, partial responses and quota fail closed", async () => {
		const requests: Array<{ url: string }> = [];
		let payload: unknown = enabledPayload();
		const http: ProviderHttp = {
			async json(url) {
				requests.push({ url });
				if (payload instanceof Error) throw payload;
				return payload;
			},
		};
		const env = posthogEnv();

		delete env.POSTHOG_PROJECT_TOKEN;
		expect(await evaluateFlags(null, { env, http })).toEqual(CLOSED_FLAGS);
		env.POSTHOG_PROJECT_TOKEN = "   ";
		expect(await evaluateFlags(null, { env, http })).toEqual(CLOSED_FLAGS);
		expect(requests).toHaveLength(0);

		env.POSTHOG_PROJECT_TOKEN = "test-project-token";
		const failures: unknown[] = [
			null,
			[],
			{ errorsWhileComputingFlags: true, flags: enabledPayload().flags },
			{ quotaLimited: ["feature_flags"], flags: enabledPayload().flags },
			new DomainError("provider_unavailable", 503),
			{ flags: { assemblies: { enabled: "true" } } },
		];
		for (const failure of failures) {
			clearFlagCache();
			payload = failure;
			expect(await evaluateFlags(null, { env, http })).toEqual(CLOSED_FLAGS);
		}

		for (const failure of [
			null,
			[],
			{ errorsWhileComputingFlags: true, flags: enabledPayload().flags },
			{ quotaLimited: ["feature_flags"], flags: enabledPayload().flags },
			new DomainError("provider_unavailable", 503),
		]) {
			clearFlagCache();
			const before = requests.length;
			payload = failure;
			expect(await evaluateFlags("account", { env, http })).toEqual(CLOSED_FLAGS);
			payload = enabledPayload();
			expect(await evaluateFlags("account", { env, http })).toEqual(OPEN_FLAGS);
			expect(requests.length).toBe(before + 2);
		}

		clearFlagCache();
		payload = { flags: { assemblies: { enabled: true } } };
		expect(await evaluateFlags(null, { env, http })).toEqual({
			...CLOSED_FLAGS,
			assemblies: true,
		});
		const beforeUnknown = requests.length;
		env.POSTHOG_HOST = "https://unexpected.example";
		expect(await evaluateFlags(null, { env, http })).toEqual(CLOSED_FLAGS);
		expect(requests.length).toBe(beforeUnknown);

		clearFlagCache();
		delete env.POSTHOG_HOST;
		payload = enabledPayload();
		expect(await evaluateFlags(null, { env, http })).toEqual(OPEN_FLAGS);
		expect(requests.at(-1)?.url).toBe("https://us.i.posthog.com/flags?v=2");

		clearFlagCache();
		env.POSTHOG_HOST = "https://eu.i.posthog.com";
		expect(await evaluateFlags("eu-user", { env, http })).toEqual(OPEN_FLAGS);
		expect(requests.at(-1)?.url).toBe("https://eu.i.posthog.com/flags?v=2");
	});
});
