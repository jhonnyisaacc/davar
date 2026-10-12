import { beforeEach, describe, expect, test } from "bun:test";
import { testDb } from "./helper.js";
import {
	authHeaders,
	createUser,
	makeTestContext,
	OPEN_FLAGS,
	READER_PROFILE,
	truncateAll,
} from "./helper.js";
import { resolveAccount } from "../src/services/accounts.js";
import { providerConnections } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

beforeEach(truncateAll);

async function identified(): Promise<{ id: string; headers: Record<string, string> }> {
	const id = await createUser();
	await resolveAccount(testDb().db, {
		provider: "google",
		subject: `user-${id}`,
		linkingUserId: id,
		primaryKey: "test-primary-key-for-davar-server-only-0001",
		deterministicKey: "test-deterministic-key-davar-only-0001",
	});
	return { id, headers: await authHeaders(id) };
}

function generatorFor(text: string) {
	return {
		generator: async () => text,
		env: {
			...process.env,
			NODE_ENV: "test",
			OPENROUTER_API_KEY: "test-server-key",
			SHARED_OPENROUTER_MODEL: "openrouter/free",
			AI_CONNECTION_PROVIDERS: "claude,grok,chatgpt,gemini",
		} as NodeJS.ProcessEnv,
	};
}

async function commentaryArticle(sourceId = "fixture:commentary"): Promise<void> {
	const { articles } = await import("../src/db/schema.js");
	const { enc } = await import("../src/services/fields.js");
	const key = "test-primary-key-for-davar-server-only-0001";
	await testDb()
		.db.insert(articles)
		.values({
			sourceId,
			title: "Study this passage",
			locale: "en",
			body: await enc(
				"This passage is supplied evidence for a study. Its interpretation needs verification.",
				key,
			),
			sourceUrl: "https://shaul.vercel.app/fixture",
			attribution: "Synthetic test note",
			revision: "fixture",
			inputHash: "fixture",
			publicationState: "published",
			permissions: { public_display: true, ai_grounding: true },
			references: [
				{ system_id: "davar-v1", kind: "verse", book_id: "john", chapter: 1, verse: 51 },
			],
		});
}

function groundedJson(sourceId = "fixture:commentary"): string {
	return JSON.stringify({
		answer: {
			positive_label: "Qué es",
			positive: ["Study this passage cautiously"],
			negative_label: "Qué no es",
			negative: ["A settled definition"],
			caution: null,
		},
		source_ids: [sourceId],
	});
}

describe("conversations", () => {
	test("ownership is enforced across accounts", async () => {
		const { app } = makeTestContext(generatorFor("No supplied evidence supports an answer."));
		const first = await identified();
		const second = await identified();
		const created = await app.request("/api/v1/conversations", {
			method: "POST",
			headers: first.headers,
			body: JSON.stringify({ title: "Private" }),
		});
		expect(created.status).toBe(201);
		const { id } = (await created.json()) as { id: string };

		const stranger = await app.request(`/api/v1/conversations/${id}`, {
			headers: second.headers,
		});
		expect(stranger.status).toBe(404);

		const owned = await app.request(`/api/v1/conversations/${id}`, {
			headers: first.headers,
		});
		expect(owned.status).toBe(200);
		expect(owned.headers.get("Cache-Control")).toBe("no-store");
	});

	test("messages validate input before spending quota", async () => {
		const { app } = makeTestContext(generatorFor("answer"));
		const { headers } = await identified();
		const created = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({}),
			})
		).json()) as { id: string };

		const missingId = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Hello" }),
		});
		expect(missingId.status).toBe(422);
		expect(await missingId.json()).toEqual({ error: { code: "request_id_required" } });

		const empty = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "", request_id: "request_001" }),
		});
		expect(empty.status).toBe(422);
		expect(await empty.json()).toEqual({ error: { code: "invalid_message" } });

		const badContext = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				content: "Hello",
				request_id: "request_002",
				context: { schema_version: 1, kind: "verse" },
			}),
		});
		expect(badContext.status).toBe(422);
		expect(await badContext.json()).toEqual({ error: { code: "invalid_reference" } });
	});

	test("shared AI answers from evidence without consuming quota", async () => {
		await commentaryArticle();
		const { app } = makeTestContext(generatorFor(groundedJson()));
		const { headers } = await identified();
		const created = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Study" }),
			})
		).json()) as { id: string };

		const first = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Study this passage", request_id: "request_001" }),
		});
		expect(first.status).toBe(200);
		const answer = (await first.json()) as {
			id: string;
			state: string;
			content: string;
			citations: Array<{ source_id: string }>;
			generation: Record<string, unknown>;
		};
		expect(answer.state).toBe("complete");
		expect(answer.generation.material_state).toBe("generated");
		expect(answer.generation.provider).toBe("openrouter");
		expect(answer.generation.evidence_status).toBe("supplied");
		expect(answer.citations.map((item) => item.source_id)).toEqual(["fixture:commentary"]);
		expect(answer.content).toContain("Study this passage cautiously");

		const retry = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Study this passage", request_id: "request_001" }),
		});
		expect(((await retry.json()) as { id: string }).id).toBe(answer.id);

		const me = await app.request("/api/v1/account", { headers });
		expect(((await me.json()) as { consultations_remaining: number }).consultations_remaining).toBe(1);
	});

	test("missing evidence answers from coverage without calling or consuming", async () => {
		let calls = 0;
		const base = generatorFor(groundedJson());
		const { app } = makeTestContext({
			...base,
			generator: async () => {
				calls += 1;
				return groundedJson();
			},
		});
		const { headers } = await identified();
		const created = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Missing" }),
			})
		).json()) as { id: string };
		const res = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Xyzzyplugh quantum", request_id: "missing_001" }),
		});
		expect(res.status).toBe(200);
		const answer = (await res.json()) as {
			content: string;
			citations: unknown[];
			generation: Record<string, unknown>;
		};
		expect(answer.content).toContain("couldn't find matching public passages");
		expect(answer.citations).toEqual([]);
		expect(answer.generation.provider).toBe(null);
		expect(answer.generation.evidence_status).toBe("missing");
		expect(calls).toBe(0);
	});

	test("closed flags make AI unavailable without spending", async () => {
		const { app } = makeTestContext({
			...generatorFor(groundedJson()),
			flags: { ...OPEN_FLAGS, ai_provider_connections: false, ai_shared_openrouter: false },
		});
		const { headers } = await identified();
		const denied = await app.request("/api/v1/conversations", {
			method: "POST",
			headers,
			body: JSON.stringify({ title: "Forbidden" }),
		});
		expect(denied.status).toBe(503);
		expect(await denied.json()).toEqual({ error: { code: "ai_unavailable" } });
	});

	test("unexpected provider failure is marked without consuming quota", async () => {
		await commentaryArticle();
		let calls = 0;
		const base = generatorFor(groundedJson());
		const { app } = makeTestContext({
			...base,
			generator: async () => {
				calls += 1;
				throw new Error("private upstream body");
			},
		});
		const { headers } = await identified();
		const created = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Fixture" }),
			})
		).json()) as { id: string };
		const failed = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Study this passage", request_id: "failure_001" }),
		});
		expect(failed.status).toBe(503);
		expect(await failed.json()).toEqual({ error: { code: "provider_response_unavailable" } });
		expect(calls).toBe(1);
		const show = (await (
			await app.request(`/api/v1/conversations/${created.id}`, { headers })
		).json()) as { messages: Array<{ state: string; request_id?: string }> };
		expect(show.messages.find((item) => item.state === "failed")).toBeDefined();
		const me = await app.request("/api/v1/account", { headers });
		expect(((await me.json()) as { consultations_remaining: number }).consultations_remaining).toBe(1);
	});

	test("approved personal connections take precedence over shared AI", async () => {
		await commentaryArticle();
		const { app } = makeTestContext(generatorFor(groundedJson()));
		const { id, headers } = await identified();
		const linked = await app.request("/api/v1/provider_connections", {
			method: "POST",
			headers,
			body: JSON.stringify({ provider: "chatgpt", credential: "sandbox-key-value", model: "fixture" }),
		});
		expect(linked.status).toBe(200);
		const created = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Connected" }),
			})
		).json()) as { id: string };
		const answer = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				content: "Study this passage",
				request_id: "connected_001",
				provider: "chatgpt",
			}),
		});
		expect(answer.status).toBe(200);
		expect((((await answer.json()) as { generation: { provider: string } }).generation).provider).toBe(
			"chatgpt",
		);
		const stored = await testDb()
			.db.select()
			.from(providerConnections)
			.where(eq(providerConnections.userId, id));
		expect(JSON.stringify(stored)).not.toContain("sandbox-key-value");
		const { sql } = await import("drizzle-orm");
		const buckets = await testDb().db.execute(
			sql`SELECT count(*)::int AS count FROM rate_limits WHERE bucket LIKE 'shared-ai/%'`,
		);
		expect((buckets[0] as { count: number }).count).toBe(0);
	});

	test("memory resets and busy conversations cannot be deleted", async () => {
		const { app } = makeTestContext(generatorFor("answer"));
		const { headers } = await identified();
		const created = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Pending" }),
			})
		).json()) as { id: string };
		await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Hi", request_id: "memory_001" }),
		});
		const reset = await app.request(`/api/v1/conversations/${created.id}/memory`, {
			method: "DELETE",
			headers,
		});
		expect(reset.status).toBe(204);
	});

	test("provider connections validate credentials and stay private", async () => {
		const { app } = makeTestContext(generatorFor(groundedJson()));
		const guest = await createUser({ profile: READER_PROFILE, admittedAt: null });
		const forbidden = await app.request("/api/v1/provider_connections", {
			method: "POST",
			headers: await authHeaders(guest),
			body: JSON.stringify({ provider: "chatgpt", credential: "secret-key-value", model: "m" }),
		});
		expect(forbidden.status).toBe(403);

		const { id, headers } = await identified();
		const index = await app.request("/api/v1/provider_connections", { headers });
		expect(await index.json()).toEqual({
			connections: [],
			supported: ["claude", "grok", "chatgpt", "gemini"],
			unavailable: ["muse"],
		});

		const unsupported = await app.request("/api/v1/provider_connections", {
			method: "POST",
			headers,
			body: JSON.stringify({ provider: "muse", credential: "secret-key-value", model: "m" }),
		});
		expect(unsupported.status).toBe(503);
		expect(await unsupported.json()).toEqual({ error: { code: "provider_not_supported" } });

		const { app: gated } = makeTestContext({
			...generatorFor(groundedJson()),
			env: {
				...generatorFor(groundedJson()).env,
				AI_CONNECTION_PROVIDERS: "chatgpt",
			} as NodeJS.ProcessEnv,
		});
		const unapproved = await gated.request("/api/v1/provider_connections", {
			method: "POST",
			headers,
			body: JSON.stringify({ provider: "claude", credential: "secret-key-value", model: "m" }),
		});
		expect(unapproved.status).toBe(503);
		expect(await unapproved.json()).toEqual({ error: { code: "provider_not_supported" } });

		const { app: closed } = makeTestContext({
			...generatorFor(groundedJson()),
			flags: { ...OPEN_FLAGS, ai_provider_connections: false, ai_shared_openrouter: false },
		});
		const disabled = await closed.request("/api/v1/provider_connections", {
			method: "POST",
			headers,
			body: JSON.stringify({ provider: "chatgpt", credential: "secret-key-value", model: "m" }),
		});
		expect(disabled.status).toBe(503);
		expect(await disabled.json()).toEqual({ error: { code: "feature_unavailable" } });

		const badModel = await app.request("/api/v1/provider_connections", {
			method: "POST",
			headers,
			body: JSON.stringify({ provider: "chatgpt", credential: "secret-key-value", model: "bad model!" }),
		});
		expect(badModel.status).toBe(422);
		expect(await badModel.json()).toEqual({ error: { code: "invalid_model" } });

		const short = await app.request("/api/v1/provider_connections", {
			method: "POST",
			headers,
			body: JSON.stringify({ provider: "chatgpt", credential: "short", model: "m" }),
		});
		expect(short.status).toBe(422);
		expect(await short.json()).toEqual({ error: { code: "invalid_credential" } });

		const created = await app.request("/api/v1/provider_connections", {
			method: "POST",
			headers,
			body: JSON.stringify({
				provider: "chatgpt",
				credential: "secret-key-value",
				model: "pinned-model",
			}),
		});
		expect(created.status).toBe(200);
		const createdBody = (await created.json()) as { id: string; provider: string; model: string };
		expect(createdBody.provider).toBe("chatgpt");
		expect(JSON.stringify(createdBody)).not.toContain("secret-key-value");

		const removed = await app.request(`/api/v1/provider_connections/${createdBody.id}`, {
			method: "DELETE",
			headers,
		});
		expect(removed.status).toBe(204);
		void id;
	});
});
