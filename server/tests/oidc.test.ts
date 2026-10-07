import { beforeEach, describe, expect, test } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
	authorizationUrl,
	clearJwksCache,
	providerSubject,
} from "../src/services/oauth.js";
import { DomainError } from "../src/lib/errors.js";
import { truncateAll } from "./helper.js";

beforeEach(truncateAll);

async function telegramSetup() {
	clearJwksCache();
	const { publicKey, privateKey } = await generateKeyPair("RS256");
	const jwk = await exportJWK(publicKey);
	const kid = "fixture-kid";
	const keys = { keys: [{ ...jwk, kid }] };
	const attempt = { provider: "telegram", nonce: "fixture-nonce", verifier: "fixture-pkce" };
	const env = { TELEGRAM_CLIENT_ID: "fixture-client" } as NodeJS.ProcessEnv;
	let token = "";
	const http = {
		json: async (url: string) => {
			if (url.includes("jwks")) return keys;
			return { id_token: token };
		},
	};
	const claims = (overrides: Record<string, unknown> = {}) => ({
		sub: "oidc-subject",
		id: 987654321,
		iss: "https://oauth.telegram.org",
		aud: "fixture-client",
		exp: Math.floor(Date.now() / 1000) + 300,
		iat: Math.floor(Date.now() / 1000),
		nonce: "fixture-nonce",
		...overrides,
	});
	async function sign(payload: Record<string, unknown>, key = privateKey): Promise<void> {
		token = await new SignJWT(payload)
			.setProtectedHeader({ alg: "RS256", kid })
			.sign(key);
	}
	return { attempt, env, http, claims, sign };
}

describe("oidc", () => {
	test("validates cryptographic claims and legacy telegram identity", async () => {
		const { attempt, env, http, claims, sign } = await telegramSetup();
		await sign(claims());
		expect(await providerSubject(attempt, "fixture-code", { env, http })).toBe("987654321");

		await sign(claims({ nonce: "different" }));
		await expect(providerSubject(attempt, "fixture-code", { env, http })).rejects.toMatchObject({
			code: "invalid_nonce",
		});

		await sign(claims({ aud: "other-app" }));
		await expect(providerSubject(attempt, "fixture-code", { env, http })).rejects.toBeInstanceOf(
			DomainError,
		);

		await sign(claims({ exp: Math.floor(Date.now() / 1000) - 60 }));
		await expect(providerSubject(attempt, "fixture-code", { env, http })).rejects.toBeInstanceOf(
			DomainError,
		);

		const unrelated = (await generateKeyPair("RS256")).privateKey;
		await sign(claims(), unrelated);
		await expect(providerSubject(attempt, "fixture-code", { env, http })).rejects.toBeInstanceOf(
			DomainError,
		);
	});

	test("notification permission is separate from ordinary telegram login", async () => {
		const normal = {
			provider: "telegram",
			nonce: "nonce",
			verifier: "pkce",
			notificationConsentRequested: false,
		};
		const plain = new URL(await authorizationUrl(normal, "state", "client", "http://localhost:3000"));
		expect(plain.searchParams.get("scope")).not.toContain("telegram:bot_access");
		expect(plain.searchParams.get("code_challenge_method")).toBe("S256");

		const consented = await authorizationUrl(
			{ ...normal, notificationConsentRequested: true },
			"state",
			"client",
			"http://localhost:3000",
		);
		expect(new URL(consented).searchParams.get("scope")).toContain("telegram:bot_access");
	});

	test("apple uses form_post without PKCE, google keeps S256", async () => {
		const base = {
			nonce: "nonce",
			verifier: "pkce",
			notificationConsentRequested: false,
		};
		const apple = new URL(
			await authorizationUrl({ ...base, provider: "apple" }, "state", "client", "http://localhost:3000"),
		);
		expect(apple.searchParams.get("response_mode")).toBe("form_post");
		expect(apple.searchParams.get("code_challenge")).toBe(null);

		const google = new URL(
			await authorizationUrl({ ...base, provider: "google" }, "state", "client", "http://localhost:3000"),
		);
		expect(google.searchParams.get("code_challenge_method")).toBe("S256");

		const facebook = new URL(
			await authorizationUrl(
				{ ...base, provider: "facebook" },
				"state",
				"client",
				"http://localhost:3000",
			),
		);
		expect(facebook.searchParams.get("code_challenge")).toBe(null);
	});
});
