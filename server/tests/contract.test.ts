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
import contract from "./fixtures/contract.json" with { type: "json" };

beforeEach(truncateAll);

describe("client contract", () => {
	test("account, assembly, commentary and calendar shapes hold", async () => {
		const generator = async () => "No evidence supplied.";
		const { app } = makeTestContext({
			generator,
			env: {
				...process.env,
				NODE_ENV: "test",
				FREE_AI_KEY: "test-only-key",
				FREE_AI_MODEL: "fixture-model",
			} as NodeJS.ProcessEnv,
		});
		const userId = await createUser();
		await resolveAccount(testDb().db, {
			provider: "google",
			subject: `contract-${userId}`,
			linkingUserId: userId,
			primaryKey: "test-primary-key-for-davar-server-only-0001",
			deterministicKey: "test-deterministic-key-davar-only-0001",
		});
		const headers = await authHeaders(userId);

		const account = (await (
			await app.request("/api/v1/account", { headers })
		).json()) as Record<string, unknown>;
		expect(Object.keys(account).sort()).toEqual(contract.account_keys);

		const leaderId = await createUser({
			profile: { ...READER_PROFILE, experience: "leader" },
			leaderVerified: true,
		});
		await resolveAccount(testDb().db, {
			provider: "google",
			subject: `contract-leader-${leaderId}`,
			linkingUserId: leaderId,
			primaryKey: "test-primary-key-for-davar-server-only-0001",
			deterministicKey: "test-deterministic-key-davar-only-0001",
		});
		const created = (await (
			await app.request("/api/v1/assemblies", {
				method: "POST",
				headers: await authHeaders(leaderId),
				body: JSON.stringify({ name: "Contract", kind: "online" }),
			})
		).json()) as Record<string, unknown>;
		expect(Object.keys(created).sort()).toEqual(contract.assembly_keys);

		const providers = (await (
			await app.request("/api/v1/auth/providers")
		).json()) as { providers: Array<{ id: string }> };
		expect(providers.providers.map((item) => item.id)).toEqual(contract.providers);

		const conversation = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Contract" }),
			})
		).json()) as { id: string };
		const answer = (await (
			await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content: "Explain", request_id: "contract_001" }),
			})
		).json()) as Record<string, unknown>;
		expect(Object.keys(answer).sort()).toEqual(contract.message_keys);

		const calendar = (await (
			await app.request(
				`/api/v1/calendar/today?${new URLSearchParams({
					instant: "2026-09-30T12:00:00Z",
					latitude: "31.78",
					longitude: "35.23",
					timezone: "Asia/Jerusalem",
				}).toString()}`,
			)
		).json()) as { days: Array<Record<string, unknown>> };
		expect(Object.keys(calendar.days[0] ?? {}).sort()).toEqual(contract.calendar_day_keys);
	});
});
