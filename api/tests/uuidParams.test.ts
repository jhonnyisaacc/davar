import { beforeEach, describe, expect, test } from "bun:test";
import {
	authHeaders,
	createUser,
	makeTestContext,
	READER_PROFILE,
	truncateAll,
} from "./helper.js";
import { resolveAccount } from "../src/services/accounts.js";
import { testDb } from "./helper.js";

beforeEach(truncateAll);

async function readerHeaders(): Promise<Record<string, string>> {
	const id = await createUser();
	await resolveAccount(testDb().db, {
		provider: "google",
		subject: `uuid-reader-${id}`,
		linkingUserId: id,
		primaryKey: "test-primary-key-for-davar-server-only-0001",
		deterministicKey: "test-deterministic-key-davar-only-0001",
	});
	return authHeaders(id);
}

async function leaderHeaders(): Promise<{ id: string; headers: Record<string, string> }> {
	const id = await createUser({
		profile: { ...READER_PROFILE, experience: "leader" },
		leaderVerified: true,
	});
	await resolveAccount(testDb().db, {
		provider: "google",
		subject: `uuid-leader-${id}`,
		linkingUserId: id,
		primaryKey: "test-primary-key-for-davar-server-only-0001",
		deterministicKey: "test-deterministic-key-davar-only-0001",
	});
	return { id, headers: await authHeaders(id) };
}

describe("malformed ids", () => {
	test("every :id route returns 404 not_found for abc", async () => {
		const { app } = makeTestContext();
		const headers = await readerHeaders();
		const lead = await leaderHeaders();
		const created = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: lead.headers,
			body: JSON.stringify({ name: "Qahal", kind: "online" }),
		});
		expect(created.status).toBe(201);
		const assembly = (await created.json()) as { id: string };

		const cases: Array<{ method: string; path: string }> = [
			{ method: "GET", path: "/api/v1/articles/abc" },
			{ method: "GET", path: "/api/v1/assemblies/abc" },
			{ method: "PATCH", path: "/api/v1/assemblies/abc" },
			{ method: "POST", path: "/api/v1/assemblies/abc/join" },
			{ method: "DELETE", path: "/api/v1/assemblies/abc/leave" },
			{ method: "GET", path: "/api/v1/assemblies/abc/members" },
			{
				method: "POST",
				path: `/api/v1/assemblies/${assembly.id}/memberships/abc/decision`,
			},
			{ method: "GET", path: "/api/v1/conversations/abc" },
			{ method: "DELETE", path: "/api/v1/conversations/abc" },
			{ method: "POST", path: "/api/v1/conversations/abc/messages" },
			{ method: "DELETE", path: "/api/v1/conversations/abc/memory" },
			{ method: "PATCH", path: "/api/v1/endorsements/abc" },
			{ method: "DELETE", path: "/api/v1/provider_connections/abc" },
		];
		for (const target of cases) {
			const res = await app.request(target.path, {
				method: target.method,
				headers: { ...headers, "Content-Type": "application/json" },
				body: JSON.stringify({ decision: "accept", message: "hi" }),
			});
			expect(`${target.method} ${target.path} -> ${res.status}`).toBe(
				`${target.method} ${target.path} -> 404`,
			);
			expect(await res.json()).toEqual({ error: { code: "not_found" } });
		}
	});

	test("error logs never include query params or raw messages", async () => {
		const { app } = makeTestContext();
		app.post("/api/v1/__leak_probe__", () => {
			throw Object.assign(new Error('Failed query: select ...\nparams: secret-value-1,secret-value-2'), {
				cause: { code: "XX000" },
			});
		});
		const lines: string[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			lines.push(args.map(String).join(" "));
		};
		try {
			const res = await app.request("/api/v1/__leak_probe__", { method: "POST" });
			expect(res.status).toBe(500);
		} finally {
			console.error = original;
		}
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			expect(line).not.toContain("params:");
			expect(line).not.toContain("secret-value-1");
		}
	});
});
