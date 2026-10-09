import { beforeEach, describe, expect, test } from "bun:test";
import { testDb } from "./helper.js";
import {
	authHeaders,
	createUser,
	makeTestContext,
	READER_PROFILE,
	seedFeedState,
	truncateAll,
} from "./helper.js";
import { resolveAccount } from "../src/services/accounts.js";
import contract from "./fixtures/contract.json" with { type: "json" };

beforeEach(truncateAll);

describe("client contract", () => {
	test("account, assembly, commentary and calendar shapes hold", async () => {
		await seedFeedState();
		const generator = async () =>
			JSON.stringify({
				answer: {
					positive_label: "Qué es",
					positive: ["Study this passage cautiously"],
					negative_label: "Qué no es",
					negative: ["A settled definition"],
					caution: null,
				},
				source_ids: ["fixture:commentary"],
			});
		const { app } = makeTestContext({
			generator,
			env: {
				...process.env,
				NODE_ENV: "test",
				OPENROUTER_API_KEY: "test-server-key",
				SHARED_OPENROUTER_MODEL: "openrouter/free",
				AI_CONNECTION_PROVIDERS: "claude,grok,chatgpt,gemini",
			} as NodeJS.ProcessEnv,
		});
		const { articles } = await import("../src/db/schema.js");
		const { enc } = await import("../src/services/fields.js");
		await testDb()
			.db.insert(articles)
			.values({
				sourceId: "fixture:commentary",
				title: "Study this passage",
				locale: "en",
				body: await enc(
					"This passage is supplied evidence for a study. Its interpretation needs verification.",
					"test-primary-key-for-davar-server-only-0001",
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
		).json()) as {
			providers: Array<{ id: string; available: boolean }>;
			commentary_provider: string | null;
		};
		expect(providers.providers.map((item) => item.id)).toEqual(contract.providers);
		expect(Object.keys(providers).sort()).toEqual(contract.providers_keys);
		expect(
			providers.commentary_provider === null || providers.commentary_provider === "openrouter",
		).toBe(true);

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
				body: JSON.stringify({ content: "Study this passage", request_id: "contract_001" }),
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

		const capabilities = (await (
			await app.request("/api/v1/capabilities", { headers })
		).json()) as {
			flags: Record<string, unknown>;
			ai: Record<string, unknown>;
		};
		const contractShape = contract as unknown as {
			capabilities_keys: string[];
			capabilities_ai_keys: string[];
			capabilities_flags_keys: string[];
		};
		expect(Object.keys(capabilities).sort()).toEqual(contractShape.capabilities_keys);
		expect(Object.keys(capabilities.ai).sort()).toEqual(contractShape.capabilities_ai_keys);
		expect(Object.keys(capabilities.flags).sort()).toEqual(contractShape.capabilities_flags_keys);
	});
});
