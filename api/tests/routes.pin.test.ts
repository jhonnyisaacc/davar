import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test } from "bun:test";
import { articles, monthConfirmations, newMoonObservations, notifications } from "../src/db/schema.js";
import { enc } from "../src/services/fields.js";
import { resolveAccount } from "../src/services/accounts.js";
import contract from "./fixtures/contract.json" with { type: "json" };
import {
	authHeaders,
	createUser,
	makeTestContext,
	READER_PROFILE,
	seedFeedState,
	testDb,
	truncateAll,
} from "./helper.js";

interface PinShape {
	exact: {
		account: string[];
		assembly: string[];
		message: string[];
		calendar_day: string[];
		capabilities: string[];
		capabilities_ai: string[];
		capabilities_flags: string[];
		providers: string[];
		provider: string[];
	};
	present: {
		account: string[];
		profile: string[];
		assembly: string[];
		assemblies_index: string[];
		people: string[];
		join: string[];
		members: string[];
		membership: string[];
		membership_user: string[];
		notifications: string[];
		notification: string[];
		article: string[];
		capabilities_ai: string[];
		calendar: string[];
		calendar_source: string[];
		calendar_day: string[];
		calendar_biblical: string[];
		calendar_month_identity: string[];
		calendar_rabbinic: string[];
	};
	absent: { people: string[] };
}

const pin = JSON.parse(
	readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), "../../tests/pins/rails-success-keys.json"),
		"utf8",
	),
) as PinShape;

const PRIMARY = "test-primary-key-for-davar-server-only-0001";
const DETERMINISTIC = "test-deterministic-key-davar-only-0001";

function sortedKeys(value: unknown): string[] {
	expect(value !== null && typeof value === "object" && !Array.isArray(value)).toBe(true);
	return Object.keys(value as object).sort();
}

function assertExact(value: unknown, name: keyof PinShape["exact"]): void {
	expect(sortedKeys(value)).toEqual(pin.exact[name]);
}

function assertPresent(value: unknown, name: keyof PinShape["present"]): void {
	expect(sortedKeys(value)).toEqual(expect.arrayContaining(pin.present[name]));
}

beforeEach(truncateAll);

describe("rails success json pin", () => {
	test("shape table copies contract.json and the integration-test key lists", () => {
		expect(pin.exact.account).toEqual(contract.account_keys);
		expect(pin.exact.assembly).toEqual(contract.assembly_keys);
		expect(pin.exact.message).toEqual(contract.message_keys);
		expect(pin.exact.calendar_day).toEqual(contract.calendar_day_keys);
		expect(pin.exact.capabilities).toEqual(contract.capabilities_keys);
		expect(pin.exact.capabilities_ai).toEqual(contract.capabilities_ai_keys);
		expect(pin.exact.capabilities_flags).toEqual(contract.capabilities_flags_keys);
		expect(pin.exact.providers).toEqual(contract.providers_keys);
		expect(pin.exact.provider).toEqual(["available", "id"]);
		expect(pin.present.account.every((key) => pin.exact.account.includes(key))).toBe(true);
		expect(pin.present.assembly.every((key) => pin.exact.assembly.includes(key))).toBe(true);
		expect(pin.present.capabilities_ai.every((key) => pin.exact.capabilities_ai.includes(key))).toBe(
			true,
		);
		expect(pin.present.calendar_day.every((key) => pin.exact.calendar_day.includes(key))).toBe(true);
		expect(pin.absent.people).toEqual([
			"birth_date",
			"gender",
			"identities",
			"latitude",
			"longitude",
		]);
		expect(pin.present.assemblies_index).toEqual(["assemblies", "people"]);
		expect(pin.present.people).toEqual(["contact_url", "name"]);
		expect(pin.present.join).toEqual(["state"]);
		expect(pin.present.calendar).toEqual(["days", "source"]);
		expect(pin.present.calendar_source).toEqual(["stale", "status"]);
		expect(pin.present.calendar_biblical).toEqual(["day", "month_id"]);
		expect(pin.present.calendar_month_identity).toEqual(["starts_on_evening", "status"]);
		expect(pin.present.calendar_rabbinic).toEqual(["day", "month_id", "year"]);
		expect(pin.present.article).toEqual(["attribution"]);
		expect(pin.present.notifications).toEqual(["notifications"]);
		expect(pin.present.notification).toEqual(["kind"]);
		expect(pin.present.members).toEqual(["memberships"]);
		expect(pin.present.membership).toEqual(["state", "user"]);
		expect(pin.present.membership_user).toEqual(["contact_url", "id"]);
		expect(pin.present.profile).toEqual(["answers", "city", "latitude"]);
	});

	test("success responses keep those keys", async () => {
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

		const up = await app.request("/up");
		expect(up.status).toBe(200);

		const providersResponse = await app.request("/api/v1/auth/providers");
		expect(providersResponse.status).toBe(200);
		const providers = (await providersResponse.json()) as {
			providers: Array<{ id: string }>;
		};
		assertExact(providers, "providers");
		expect(providers.providers.map((item) => item.id)).toEqual(contract.providers);
		for (const item of providers.providers) assertExact(item, "provider");

		const inserted = await testDb()
			.db.insert(articles)
			.values({
				sourceId: "fixture:commentary",
				title: "Study this passage",
				locale: "en",
				body: await enc(
					"This passage is supplied evidence for a study. Its interpretation needs verification.",
					PRIMARY,
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
			})
			.returning({ id: articles.id });
		const articleId = inserted[0]?.id;
		expect(articleId).toBeTruthy();
		const article = await app.request(`/api/v1/articles/${articleId}`);
		expect(article.status).toBe(200);
		assertPresent(await article.json(), "article");

		const userId = await createUser();
		await resolveAccount(testDb().db, {
			provider: "google",
			subject: `pin-${userId}`,
			linkingUserId: userId,
			primaryKey: PRIMARY,
			deterministicKey: DETERMINISTIC,
		});
		const headers = await authHeaders(userId);
		const account = await app.request("/api/v1/account", { headers });
		expect(account.status).toBe(200);
		const accountBody = await account.json();
		assertExact(accountBody, "account");
		assertPresent(accountBody, "account");
		assertPresent((accountBody as { profile: unknown }).profile, "profile");

		const patched = await app.request("/api/v1/account", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ display_name: "Pinned" }),
		});
		expect(patched.status).toBe(200);
		assertExact(await patched.json(), "account");

		const preferences = await app.request("/api/v1/account/notification_preferences", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ enabled: false }),
		});
		expect(preferences.status).toBe(200);
		assertExact(await preferences.json(), "account");

		await testDb().db.insert(notifications).values({
			userId,
			kind: "join_requested",
			data: {},
		});
		const notes = await app.request("/api/v1/account/notifications", { headers });
		expect(notes.status).toBe(200);
		const notesBody = (await notes.json()) as { notifications: unknown[] };
		assertPresent(notesBody, "notifications");
		expect(notesBody.notifications.length).toBeGreaterThan(0);
		assertPresent(notesBody.notifications[0], "notification");

		const neighborId = await createUser({
			displayName: "Nearby",
			discoverable: true,
			profile: { ...READER_PROFILE, city: "Jerusalem", latitude: 31.8, longitude: 35.25 },
		});
		await resolveAccount(testDb().db, {
			provider: "google",
			subject: `pin-neighbor-${neighborId}`,
			linkingUserId: neighborId,
			primaryKey: PRIMARY,
			deterministicKey: DETERMINISTIC,
		});
		const peopleResponse = await app.request(
			"/api/v1/assemblies?kind=in_person&latitude=31.8&longitude=35.25&radius_km=10",
			{ headers },
		);
		expect(peopleResponse.status).toBe(200);
		const peopleBody = (await peopleResponse.json()) as { people: Array<Record<string, unknown>> };
		expect(sortedKeys(peopleBody)).toEqual(pin.present.assemblies_index);
		expect(peopleBody.people.length).toBeGreaterThan(0);
		for (const person of peopleBody.people) {
			assertPresent(person, "people");
			expect(sortedKeys(person).filter((key) => pin.absent.people.includes(key))).toEqual([]);
		}

		const leaderId = await createUser({
			profile: { ...READER_PROFILE, experience: "leader" },
			leaderVerified: true,
		});
		await resolveAccount(testDb().db, {
			provider: "google",
			subject: `pin-leader-${leaderId}`,
			linkingUserId: leaderId,
			primaryKey: PRIMARY,
			deterministicKey: DETERMINISTIC,
		});
		const leaderHeaders = await authHeaders(leaderId);
		const created = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: leaderHeaders,
			body: JSON.stringify({ name: "Pin", kind: "online" }),
		});
		expect(created.status).toBe(201);
		const createdBody = (await created.json()) as { id: string };
		assertExact(createdBody, "assembly");
		const assemblyId = createdBody.id;

		const shown = await app.request(`/api/v1/assemblies/${assemblyId}`, { headers: leaderHeaders });
		expect(shown.status).toBe(200);
		assertExact(await shown.json(), "assembly");

		const patchedAssembly = await app.request(`/api/v1/assemblies/${assemblyId}`, {
			method: "PATCH",
			headers: leaderHeaders,
			body: JSON.stringify({ name: "Pin renamed" }),
		});
		expect(patchedAssembly.status).toBe(200);
		assertExact(await patchedAssembly.json(), "assembly");

		const putAssembly = await app.request(`/api/v1/assemblies/${assemblyId}`, {
			method: "PUT",
			headers: leaderHeaders,
			body: JSON.stringify({ name: "Pin put" }),
		});
		expect(putAssembly.status).toBe(200);
		assertExact(await putAssembly.json(), "assembly");

		const index = await app.request("/api/v1/assemblies?kind=online", { headers });
		expect(index.status).toBe(200);
		const indexBody = (await index.json()) as { assemblies: unknown[] };
		expect(sortedKeys(indexBody)).toEqual(pin.present.assemblies_index);
		expect(indexBody.assemblies.length).toBeGreaterThan(0);
		for (const item of indexBody.assemblies) assertExact(item, "assembly");

		const members = await app.request(`/api/v1/assemblies/${assemblyId}/members`, {
			headers: leaderHeaders,
		});
		expect(members.status).toBe(200);
		const membersBody = (await members.json()) as {
			memberships: Array<{ user: unknown }>;
		};
		assertPresent(membersBody, "members");
		expect(membersBody.memberships.length).toBeGreaterThan(0);
		assertPresent(membersBody.memberships[0], "membership");
		assertPresent(membersBody.memberships[0]?.user, "membership_user");

		const joined = await app.request(`/api/v1/assemblies/${assemblyId}/join`, {
			method: "POST",
			headers,
		});
		expect(joined.status).toBe(200);
		assertPresent(await joined.json(), "join");

		const conversation = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Pin" }),
			})
		).json()) as { id: string };
		const answer = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Study this passage", request_id: "pin_0001" }),
		});
		expect(answer.status).toBe(200);
		assertExact(await answer.json(), "message");

		const capabilities = await app.request("/api/v1/capabilities", { headers });
		expect(capabilities.status).toBe(200);
		const capabilitiesBody = (await capabilities.json()) as { ai: unknown; flags: unknown };
		assertExact(capabilitiesBody, "capabilities");
		assertExact(capabilitiesBody.ai, "capabilities_ai");
		assertPresent(capabilitiesBody.ai, "capabilities_ai");
		assertExact(capabilitiesBody.flags, "capabilities_flags");

		const observation = await testDb()
			.db.insert(newMoonObservations)
			.values({
				sourceId: "pin:2026-09-12",
				source: "israeli_new_moon_society",
				sourceUrl: "https://example.test/moon",
				inputHash: "pin",
				observedOn: "2026-09-12",
				country: "IL",
				visibilityMethod: "unaided",
				verified: true,
				provenance: { observer: "Witness", location: "Jerusalem" },
			})
			.returning({ id: newMoonObservations.id });
		const observationId = observation[0]?.id;
		expect(observationId).toBeTruthy();
		await testDb().db.insert(monthConfirmations).values({
			newMoonObservationId: observationId as string,
			startsOnEvening: "2026-09-12",
		});

		const calendar = await app.request(
			`/api/v1/calendar/today?${new URLSearchParams({
				instant: "2026-10-03T22:00:00Z",
				latitude: "-34.6",
				longitude: "-58.4",
				timezone: "America/Argentina/Buenos_Aires",
			}).toString()}`,
		);
		expect(calendar.status).toBe(200);
		const calendarBody = (await calendar.json()) as {
			days: Array<Record<string, unknown>>;
			source: unknown;
		};
		assertPresent(calendarBody, "calendar");
		assertPresent(calendarBody.source, "calendar_source");
		const day = calendarBody.days[0];
		expect(day).toBeTruthy();
		assertExact(day, "calendar_day");
		assertPresent(day, "calendar_day");
		assertPresent(day?.biblical, "calendar_biblical");
		assertPresent(day?.month_identity, "calendar_month_identity");
		assertPresent(day?.rabbinic, "calendar_rabbinic");
	});
});
