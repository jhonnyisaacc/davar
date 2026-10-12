import { beforeEach, describe, expect, test } from "bun:test";
import { articles } from "../src/db/schema.js";
import { enc } from "../src/services/fields.js";
import {
	authHeaders,
	createUser,
	makeTestContext,
	OPEN_FLAGS,
	testDb,
	truncateAll,
} from "./helper.js";

beforeEach(truncateAll);

describe("commentary and account sign-in flags", () => {
	test("articles stay available when commentary is off", async () => {
		const { app, deps } = makeTestContext({
			flags: { ...OPEN_FLAGS, commentary: false },
		});
		const index = await app.request("/api/v1/articles");
		expect(index.status).toBe(200);

		const published = await testDb()
			.db.insert(articles)
			.values({
				sourceId: "shaul:note:commentary-off",
				title: "Public",
				locale: "en",
				body: await enc("Public body", deps.config.encryptionPrimaryKey),
				sourceUrl: "https://shaul.vercel.app/public",
				attribution: "Public Shaul note",
				revision: "rev-1",
				inputHash: "hash",
				publicationState: "published",
				references: [],
				permissions: { public_display: true },
			})
			.returning({ id: articles.id });
		const articleId = published[0]?.id ?? "";
		const article = await app.request(`/api/v1/articles/${articleId}`);
		expect(article.status).toBe(200);
		expect((await article.json() as { attribution: string }).attribution).toBe(
			"Public Shaul note",
		);

		const capabilities = (await (
			await app.request("/api/v1/capabilities")
		).json()) as { flags: Record<string, boolean> };
		expect(capabilities.flags.commentary).toBe(false);
		expect(capabilities.flags.ai_provider_connections).toBe(false);
		expect(capabilities.flags.ai_shared_openrouter).toBe(false);
	});

	test("a conversation route returns feature_unavailable when commentary is off", async () => {
		const { app } = makeTestContext({
			flags: { ...OPEN_FLAGS, commentary: false },
		});
		const headers = await authHeaders(await createUser());
		const response = await app.request("/api/v1/conversations", { headers });
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: { code: "feature_unavailable" } });
	});

	test("auth start returns feature_unavailable when account sign-in is off", async () => {
		const { app } = makeTestContext({
			flags: { ...OPEN_FLAGS, account_sign_in: false },
		});
		const response = await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				return_uri: "davar://auth/callback",
				email: "reader@example.test",
			}),
		});
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: { code: "feature_unavailable" } });
	});

	test("guest sign-in and session exchange stay open when account sign-in is off", async () => {
		const { app, deps, outbox } = makeTestContext();
		const start = await app.request("/api/v1/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				return_uri: "davar://auth/callback",
				email: "reader@example.test",
			}),
		});
		expect(start.status).toBe(200);
		const url = outbox[0]?.body.split(/\s/).find((word) => word.startsWith("http")) ?? "";
		const state = new URL(url).searchParams.get("state") ?? "";
		const callback = await app.request(
			`/api/v1/auth/email/callback?state=${encodeURIComponent(state)}`,
			{ redirect: "manual" },
		);
		const location = callback.headers.get("Location") ?? "";
		const code = new URL(location.replace("davar://", "http://x/")).searchParams.get("code") ?? "";

		deps.flags = { ...OPEN_FLAGS, account_sign_in: false };

		const guest = await app.request("/api/v1/auth/guest", { method: "POST" });
		expect(guest.status).toBe(201);
		expect(typeof ((await guest.json()) as { token: string }).token).toBe("string");

		const exchange = await app.request("/api/v1/auth/exchange", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		expect(exchange.status).toBe(200);
		expect(typeof ((await exchange.json()) as { token: string }).token).toBe("string");
	});
});
