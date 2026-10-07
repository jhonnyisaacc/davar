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

	test("facebook signs appsecret_proof with the raw client secret", async () => {
		const { createHmac } = await import("node:crypto");
		const secret = "fixture-facebook-secret";
		const access = "fixture-access-token";
		const urls: string[] = [];
		const http = {
			json: async (url: string) => {
				urls.push(url);
				if (url.includes("/me?")) return { id: "fb-123" };
				return { access_token: access };
			},
		};
		const env = {
			FACEBOOK_CLIENT_ID: "fixture-client",
			FACEBOOK_CLIENT_SECRET: secret,
		} as NodeJS.ProcessEnv;
		const attempt = { provider: "facebook", nonce: "n", verifier: "v" };
		await expect(providerSubject(attempt, "code", { env, http })).resolves.toBe("fb-123");
		const graph = urls.find((url) => url.includes("/me?"));
		const proof = graph ? new URL(graph).searchParams.get("appsecret_proof") : null;
		expect(proof).toBe(createHmac("sha256", secret).update(access).digest("hex"));
	});

	test("google pins RS256 and refetches JWKS on unknown kids", async () => {
		clearJwksCache();
		const { importJWK } = await import("jose");
		const secret = new TextEncoder().encode("fixture-hs256-secret-00000001");
		const oct = { kty: "oct", k: Buffer.from(secret).toString("base64url"), kid: "hs-kid" };
		const { publicKey, privateKey } = await generateKeyPair("RS256");
		const rsa = { ...(await exportJWK(publicKey)), kid: "rsa-kid" };
		let jwks = { keys: [{ ...rsa }] };
		const fetches: string[] = [];
		const http = {
			json: async (url: string) => {
				fetches.push(url);
				if (url.includes("certs")) return jwks;
				return { id_token: token };
			},
		};
		const env = {
			GOOGLE_CLIENT_ID: "fixture-client",
			GOOGLE_CLIENT_SECRET: "fixture-secret",
		} as NodeJS.ProcessEnv;
		const attempt = { provider: "google", nonce: "fixture-nonce", verifier: "v" };
		const claims = {
			sub: "google-subject",
			iss: "https://accounts.google.com",
			aud: "fixture-client",
			exp: Math.floor(Date.now() / 1000) + 300,
			iat: Math.floor(Date.now() / 1000),
			nonce: "fixture-nonce",
		};
		let token = "";
		// HS256 with a matching kid must be rejected: only RS256 is allowed.
		jwks = { keys: [{ ...oct }] };
		token = await new SignJWT(claims)
			.setProtectedHeader({ alg: "HS256", kid: "hs-kid" })
			.sign(await importJWK(oct, "HS256"));
		await expect(
			providerSubject(attempt, "code", { env, http, jwksCooldownMs: 0 }),
		).rejects.toMatchObject({ code: "invalid_provider_identity" });

		// Key rotation: a token signed by an unknown kid refetches the JWKS.
		clearJwksCache();
		fetches.length = 0;
		jwks = { keys: [{ ...rsa }] };
		token = await new SignJWT(claims)
			.setProtectedHeader({ alg: "RS256", kid: "rsa-kid" })
			.sign(privateKey);
		await expect(
			providerSubject(attempt, "code", { env, http, jwksCooldownMs: 0 }),
		).resolves.toBe("google-subject");
		const rotatedPair = await generateKeyPair("RS256");
		const rotated = rotatedPair.privateKey;
		const rotatedJwk = { ...(await exportJWK(rotatedPair.publicKey)), kid: "rsa-kid-2" };
		jwks = { keys: [rotatedJwk] };
		token = await new SignJWT(claims)
			.setProtectedHeader({ alg: "RS256", kid: "rsa-kid-2" })
			.sign(rotated);
		await expect(
			providerSubject(attempt, "code", { env, http, jwksCooldownMs: 0 }),
		).resolves.toBe("google-subject");
		expect(fetches.filter((url) => url.includes("certs"))).toHaveLength(2);
	});

	test("slow providers never hold the attempt row lock", async () => {
		clearJwksCache();
		const { startAuthentication, finishAuthentication } = await import(
			"../src/services/authentication.js"
		);
		const { sha256Hex } = await import("../src/lib/crypto.js");
		const { authAttempts } = await import("../src/db/schema.js");
		const { eq } = await import("drizzle-orm");
		const { testConfig, testDb } = await import("./helper.js");
		const config = testConfig();

		const { publicKey, privateKey } = await generateKeyPair("RS256");
		const kid = "slow-kid";
		const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid }] };
		let tokenCalls = 0;
		const http = {
			json: async (url: string) => {
				if (url.includes("certs")) return jwks;
				tokenCalls++;
				await new Promise((resolve) => setTimeout(resolve, 400));
				return { id_token: token };
			},
		};
		const env = {
			GOOGLE_CLIENT_ID: "fixture-client",
			GOOGLE_CLIENT_SECRET: "fixture-secret",
		} as NodeJS.ProcessEnv;
		const started = await startAuthentication(testDb().db, {
			provider: "google",
			returnUri: "davar://auth/callback",
			allowedReturnUris: ["davar://auth/callback"],
			apiPublicUrl: "http://localhost:3000",
			primaryKey: config.encryptionPrimaryKey,
			deterministicKey: config.encryptionDeterministicKey,
			env,
			sendMail: async () => {},
		});
		if (!("authorization_url" in started)) throw new Error("OAuth start failed");
		const captured = new URL(started.authorization_url).searchParams.get("state") ?? "";
		const digest = await sha256Hex(captured);
		const attempts = await testDb()
			.db.select({ nonce: authAttempts.nonce })
			.from(authAttempts)
			.where(eq(authAttempts.stateDigest, digest))
			.limit(1);
		const nonce = attempts[0]?.nonce ?? "";
		let token = await new SignJWT({
			sub: "slow-subject",
			iss: "https://accounts.google.com",
			aud: "fixture-client",
			exp: Math.floor(Date.now() / 1000) + 300,
			iat: Math.floor(Date.now() / 1000),
			nonce,
		})
			.setProtectedHeader({ alg: "RS256", kid })
			.sign(privateKey);
		const pending = finishAuthentication(
			testDb().db,
			{
				provider: "google",
				state: captured,
				code: "slow-code",
				apiPublicUrl: "http://localhost:3000",
				primaryKey: config.encryptionPrimaryKey,
				deterministicKey: config.encryptionDeterministicKey,
			},
			{ env, http, jwksCooldownMs: 0 },
		);
		while (tokenCalls === 0) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		// Provider I/O is in flight: the attempt row must be lock-free.
		const probe = await testDb().sql`
			SELECT id FROM auth_attempts WHERE state_digest = ${digest} FOR UPDATE NOWAIT
		`;
		expect(probe.length).toBe(1);
		await expect(pending).resolves.toMatch(/^davar:\/\/auth\/callback\?code=/);
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
