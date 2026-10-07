import { beforeEach, describe, expect, test } from "bun:test";
import {
	authHeaders,
	createUser,
	json,
	makeTestContext,
	truncateAll,
} from "./helper.js";

beforeEach(truncateAll);

describe("health", () => {
	test("GET /up reports ok", async () => {
		const { app } = makeTestContext();
		const res = await app.request("/up");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: "ok" });
	});
});

describe("guest sessions", () => {
	test("issues an isolated token and throttles", async () => {
		const { app } = makeTestContext();
		for (let i = 0; i < 3; i++) {
			const res = await app.request("/api/v1/auth/guest", { method: "POST" });
			expect(res.status).toBe(201);
			expect(await res.json()).toHaveProperty("token");
		}
		const limited = await app.request("/api/v1/auth/guest", { method: "POST" });
		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({ error: { code: "rate_limited" } });
	});
});

describe("providers", () => {
	test("lists six providers with email always available", async () => {
		const { app } = makeTestContext();
		const res = await app.request("/api/v1/auth/providers");
		expect(res.status).toBe(200);
		const body = await res.json() as { providers: Array<{ id: string; available: boolean }> };
		expect(body.providers.map((item) => item.id)).toEqual([
			"google",
			"apple",
			"facebook",
			"telegram",
			"x",
			"email",
		]);
		expect(body.providers.find((item) => item.id === "email")?.available).toBe(true);
		expect(body.providers.find((item) => item.id === "google")?.available).toBe(false);
	});
});

describe("email magic link state machine", () => {
	test("rejects invalid email and return URIs, and unconfigured providers", async () => {
		const { app } = makeTestContext();
		const badEmail = await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ return_uri: "davar://auth/callback", email: "not-an-email" }),
		});
		expect(badEmail.status).toBe(422);
		expect(await badEmail.json()).toEqual({ error: { code: "invalid_email" } });

		const badUri = await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ return_uri: "https://evil.example", email: "a@b.co" }),
		});
		expect(badUri.status).toBe(422);
		expect(await badUri.json()).toEqual({ error: { code: "invalid_return_uri" } });

		const missing = await app.request("/api/v1/auth/google/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ return_uri: "davar://auth/callback" }),
		});
		expect(missing.status).toBe(503);
		expect(await missing.json()).toEqual({ error: { code: "provider_not_configured" } });
	});

	test("magic links and handoffs are single use", async () => {
		const { app, outbox } = makeTestContext();
		const start = await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ return_uri: "davar://auth/callback", email: "Reader@Example.org" }),
		});
		expect(start.status).toBe(200);
		expect(await start.json()).toEqual({ email_sent: true });
		expect(outbox).toHaveLength(1);
		const url = outbox[0]?.body.split(/\s/).find((word) => word.startsWith("http")) ?? "";
		const state = new URL(url).searchParams.get("state") ?? "";
		expect(state.length).toBeGreaterThan(10);

		const callback = await app.request(
			`/api/v1/auth/email/callback?state=${encodeURIComponent(state)}`,
			{ redirect: "manual" },
		);
		expect(callback.status).toBe(302);
		const location = callback.headers.get("Location") ?? "";
		expect(location.startsWith("davar://auth/callback?code=")).toBe(true);
		const code = new URL(location.replace("davar://", "http://x/")).searchParams.get("code") ?? "";

		const exchange = await app.request("/api/v1/auth/exchange", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		expect(exchange.status).toBe(200);
		const { token } = (await exchange.json()) as { token: string };
		expect(typeof token).toBe("string");

		const me = await app.request("/api/v1/account", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(me.status).toBe(200);

		const reuse = await app.request("/api/v1/auth/exchange", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		expect(reuse.status).toBe(404);
		expect(await reuse.json()).toEqual({ error: { code: "not_found" } });

		const replay = await app.request(
			`/api/v1/auth/email/callback?state=${encodeURIComponent(state)}`,
			{ redirect: "manual" },
		);
		expect(replay.status).toBe(401);
		expect(await replay.json()).toEqual({ error: { code: "expired_or_used_link" } });
	});

	test("form_post callbacks resolve like query callbacks", async () => {
		const { app, outbox } = makeTestContext();
		await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ return_uri: "davar://auth/callback", email: "form@example.test" }),
		});
		const url = outbox[0]?.body.split(/\s/).find((word) => word.startsWith("http")) ?? "";
		const state = new URL(url).searchParams.get("state") ?? "";
		const callback = await app.request("/api/v1/auth/email/callback", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ state }).toString(),
			redirect: "manual",
		});
		expect(callback.status).toBe(302);
		expect((callback.headers.get("Location") ?? "").startsWith("davar://auth/callback?code=")).toBe(
			true,
		);
	});

	test("blank handoff and denied providers fail closed", async () => {
		const { app } = makeTestContext();
		const blank = await app.request("/api/v1/auth/exchange", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(blank.status).toBe(401);
		expect(await blank.json()).toEqual({ error: { code: "invalid_handoff" } });

		const denied = await app.request("/api/v1/auth/google/callback?error=access_denied", {
			redirect: "manual",
		});
		expect(denied.status).toBe(401);
		expect(await denied.json()).toEqual({ error: { code: "provider_denied" } });
	});

	test("linking requires a session and consent requires telegram", async () => {
		const { app } = makeTestContext();
		const link = await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ return_uri: "davar://auth/callback", email: "a@b.co", link: true }),
		});
		expect(link.status).toBe(401);

		const userId = await createUser();
		const headers = await authHeaders(userId);
		const consent = await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers,
			body: JSON.stringify({
				return_uri: "davar://auth/callback",
				email: "a@b.co",
				link: true,
				notification_consent: true,
			}),
		});
		expect(consent.status).toBe(422);
		expect(await consent.json()).toEqual({ error: { code: "invalid_notification_consent" } });
	});
});

describe("sessions", () => {
	test("logout revokes and isolates the session", async () => {
		const { app } = makeTestContext();
		const userId = await createUser();
		const headers = await authHeaders(userId);
		const me = await app.request("/api/v1/account", { headers });
		expect(me.status).toBe(200);
		expect(me.headers.get("Cache-Control")).toBe("no-store");

		const bye = await app.request("/api/v1/auth/session", { method: "DELETE", headers });
		expect(bye.status).toBe(204);
		const after = await app.request("/api/v1/account", { headers });
		expect(after.status).toBe(401);
		expect(await after.json()).toEqual({ error: { code: "authentication_required" } });
	});

	test("account requires authentication", async () => {
		const { app } = makeTestContext();
		const res = await app.request("/api/v1/account");
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: { code: "authentication_required" } });
		const { status, body } = await json<{ error: { code: string } }>(
			await app.request("/api/v1/assemblies?kind=online"),
		);
		expect(status).toBe(401);
		expect(body).toEqual({ error: { code: "authentication_required" } });
	});
});
