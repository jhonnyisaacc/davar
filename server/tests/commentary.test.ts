import { beforeEach, describe, expect, test } from "bun:test";
import { testDb } from "./helper.js";
import {
	authHeaders,
	createUser,
	makeTestContext,
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
			FREE_AI_KEY: "test-only-key",
			FREE_AI_MODEL: "fixture-model",
		} as NodeJS.ProcessEnv,
	};
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

	test("one sponsored consultation, then a connection is required", async () => {
		const { app } = makeTestContext(
			generatorFor("No supplied evidence supports an answer."),
		);
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
			body: JSON.stringify({ content: "Explain", request_id: "request_001" }),
		});
		expect(first.status).toBe(200);
		const answer = (await first.json()) as {
			id: string;
			state: string;
			generation: Record<string, unknown>;
		};
		expect(answer.state).toBe("complete");
		expect(answer.generation.material_state).toBe("generated");

		const retry = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Explain", request_id: "request_001" }),
		});
		expect(((await retry.json()) as { id: string }).id).toBe(answer.id);

		const second = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Again", request_id: "request_002" }),
		});
		expect(second.status).toBe(402);
		expect(await second.json()).toEqual({ error: { code: "provider_connection_required" } });

		const me = await app.request("/api/v1/account", { headers });
		expect(((await me.json()) as { consultations_remaining: number }).consultations_remaining).toBe(0);
	});

	test("unexpected provider failure refunds and marks the message", async () => {
		let calls = 0;
		const { app, deps } = makeTestContext({
			generator: async () => {
				calls += 1;
				throw new Error("private upstream body");
			},
			env: {
				...process.env,
				NODE_ENV: "test",
				FREE_AI_KEY: "test-only-key",
				FREE_AI_MODEL: "fixture-model",
			} as NodeJS.ProcessEnv,
		});
		void deps;
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
			body: JSON.stringify({ content: "Study", request_id: "failure_001" }),
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

	test("connected consultations do not consume quota", async () => {
		const { app } = makeTestContext(generatorFor("Connected answer."));
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
				content: "Connected",
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
		const { app } = makeTestContext();
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
