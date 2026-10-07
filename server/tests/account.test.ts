import { beforeEach, describe, expect, test } from "bun:test";
import { testDb } from "./helper.js";
import {
	authHeaders,
	createUser,
	json,
	makeTestContext,
	READER_PROFILE,
	truncateAll,
} from "./helper.js";
import { resolveAccount } from "../src/services/accounts.js";
import { accessCodeDigest } from "../src/services/admissions.js";
import { accessCodes } from "../src/db/schema.js";

beforeEach(truncateAll);

async function identifiedUser(
	profile: Record<string, unknown> = READER_PROFILE,
	admitted = true,
): Promise<string> {
	const userId = await createUser({
		profile,
		admittedAt: admitted ? new Date() : null,
	});
	await resolveAccount(testDb().db, {
		provider: "google",
		subject: `subject-${userId}`,
		linkingUserId: userId,
		primaryKey: "test-primary-key-for-davar-server-only-0001",
		deterministicKey: "test-deterministic-key-davar-only-0001",
	});
	return userId;
}

describe("account", () => {
	test("shows the account shape and never caches", async () => {
		const { app } = makeTestContext();
		const userId = await identifiedUser();
		const res = await app.request("/api/v1/account", {
			headers: await authHeaders(userId),
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		const body = (await res.json()) as Record<string, unknown>;
		expect(Object.keys(body).sort()).toEqual(
			[
				"admitted",
				"consultations_remaining",
				"contact_visible",
				"discoverable",
				"display_name",
				"id",
				"leader_verified",
				"onboarding_complete",
				"profile",
				"providers",
				"settings",
				"settings_version",
			].sort(),
		);
		expect(body.providers).toEqual(["google"]);
		expect(body.onboarding_complete).toBe(true);
		expect(body.consultations_remaining).toBe(1);
	});

	test("assemblies require admission and verified flags cannot be self-granted", async () => {
		const { app } = makeTestContext();
		const userId = await identifiedUser(READER_PROFILE, false);
		const headers = await authHeaders(userId);
		const gated = await app.request("/api/v1/assemblies?kind=online", { headers });
		expect(gated.status).toBe(403);
		expect(await gated.json()).toEqual({ error: { code: "admission_required" } });

		const patch = await app.request("/api/v1/account", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ leader_verified: true, display_name: "Renamed" }),
		});
		expect(patch.status).toBe(200);
		const body = (await patch.json()) as { leader_verified: boolean; display_name: string };
		expect(body.leader_verified).toBe(false);
		expect(body.display_name).toBe("Renamed");
	});

	test("profile updates enforce domain rules", async () => {
		const { app } = makeTestContext();
		const userId = await identifiedUser();
		const headers = await authHeaders(userId);
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ profile: { gender: "female", experience: "leader" } }, "female_leader_forbidden"],
			[{ profile: { answers: { "1": "yes" } } }, "invalid_answers"],
			[{ profile: { gender: "other" } }, "invalid_gender"],
			[{ profile: { experience: "novice" } }, "invalid_experience"],
			[{ contact_visible: true }, "telegram_contact_required"],
		];
		for (const [payload, code] of cases) {
			const res = await app.request("/api/v1/account", {
				method: "PATCH",
				headers,
				body: JSON.stringify(payload),
			});
			expect(res.status).toBe(422);
			expect(await res.json()).toEqual({ error: { code } });
		}
	});

	test("settings keep versions and text-mode dependencies", async () => {
		const { app } = makeTestContext();
		const userId = await identifiedUser();
		const headers = await authHeaders(userId);
		const first = await app.request("/api/v1/account/settings", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ settings: { language: "he" }, version: 0 }),
		});
		expect(first.status).toBe(200);
		expect(((await first.json()) as { settings_version: number }).settings_version).toBe(1);

		const stale = await app.request("/api/v1/account/settings", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ settings: { language: "es" }, version: 0 }),
		});
		expect(stale.status).toBe(409);
		expect(await stale.json()).toEqual({ error: { code: "settings_conflict" } });

		const invalid = await app.request("/api/v1/account/settings", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ settings: { language: "invalid" }, version: 1 }),
		});
		expect(invalid.status).toBe(422);

		const modes = await app.request("/api/v1/account/settings", {
			method: "PATCH",
			headers,
			body: JSON.stringify({
				settings: { translationOnly: true, showFullChapter: true, seferMode: true },
				version: 1,
			}),
		});
		expect(modes.status).toBe(200);
		const second = await app.request("/api/v1/account/settings", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ settings: { hebrewOnly: true }, version: 2 }),
		});
		const body = (await second.json()) as { settings: Record<string, boolean> };
		expect(body.settings.translationOnly).toBe(false);
	});

	test("admission codes are bounded and idempotent", async () => {
		const config = makeTestContext().deps.config;
		await testDb()
			.db.insert(accessCodes)
			.values({
				codeDigest: await accessCodeDigest("test-code"),
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
				maxUses: 1,
			});
		const { app } = makeTestContext();
		const first = await createUser({ profile: READER_PROFILE, admittedAt: null });
		await resolveAccount(testDb().db, {
			provider: "google",
			subject: "first-subject",
			linkingUserId: first,
			primaryKey: config.encryptionPrimaryKey,
			deterministicKey: config.encryptionDeterministicKey,
		});
		const headers = await authHeaders(first);
		const redeem = await app.request("/api/v1/account/admission", {
			method: "POST",
			headers,
			body: JSON.stringify({ code: "testcode" }),
		});
		expect(redeem.status).toBe(200);
		expect(((await redeem.json()) as { admitted: boolean }).admitted).toBe(true);
		const again = await app.request("/api/v1/account/admission", {
			method: "POST",
			headers,
			body: JSON.stringify({ code: "testcode" }),
		});
		expect(again.status).toBe(200);

		const second = await createUser({ profile: READER_PROFILE, admittedAt: null });
		await resolveAccount(testDb().db, {
			provider: "google",
			subject: "second-subject",
			linkingUserId: second,
			primaryKey: config.encryptionPrimaryKey,
			deterministicKey: config.encryptionDeterministicKey,
		});
		const denied = await app.request("/api/v1/account/admission", {
			method: "POST",
			headers: await authHeaders(second),
			body: JSON.stringify({ code: "testcode" }),
		});
		expect(denied.status).toBe(403);
		expect(await denied.json()).toEqual({ error: { code: "invalid_code" } });
	});

	test("notification permission can only be revoked", async () => {
		const { app } = makeTestContext();
		const userId = await identifiedUser();
		const headers = await authHeaders(userId);
		const grant = await app.request("/api/v1/account/notification_preferences", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ enabled: true }),
		});
		expect(grant.status).toBe(422);
		expect(await grant.json()).toEqual({
			error: { code: "notification_authorization_required" },
		});
		const revoke = await app.request("/api/v1/account/notification_preferences", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ enabled: false }),
		});
		expect(revoke.status).toBe(200);
		expect(((await revoke.json()) as { settings: Record<string, boolean> }).settings.telegram_notifications).toBe(
			false,
		);
	});

	test("notifications list the latest entries", async () => {
		const { app } = makeTestContext();
		const userId = await identifiedUser();
		const headers = await authHeaders(userId);
		const res = await app.request("/api/v1/account/notifications", { headers });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ notifications: [] });
	});

	test("guest accounts cannot reach assembly-gated cities", async () => {
		const { app } = makeTestContext();
		const guest = await createUser({ profile: {}, admittedAt: null });
		const res = await app.request("/api/v1/cities?q=Buenos", {
			headers: await authHeaders(guest),
		});
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: { code: "registered_account_required" } });
	});

	test("sandbox cities resolve into signed profile locations", async () => {
		const { app, deps } = makeTestContext();
		deps.env = {
			...deps.env,
			DAVAR_DEV_SANDBOX: "1",
			NODE_ENV: "development",
		} as NodeJS.ProcessEnv;
		const userId = await identifiedUser();
		const headers = await authHeaders(userId);
		const search = await app.request("/api/v1/cities?q=Buenos", { headers });
		expect(search.status).toBe(200);
		const { cities } = (await search.json()) as {
			cities: Array<{ city: string; selection: string }>;
		};
		expect(cities.length).toBeGreaterThan(0);
		const update = await app.request("/api/v1/account/city", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ selection: cities[0]?.selection }),
		});
		expect(update.status).toBe(200);
		expect(await update.json()).toEqual({ city: "Buenos Aires" });

		const tampered = await app.request("/api/v1/account/city", {
			method: "PATCH",
			headers,
			body: JSON.stringify({ selection: "broken.token" }),
		});
		expect(tampered.status).toBe(422);
		expect(await tampered.json()).toEqual({ error: { code: "invalid_city_selection" } });
		const { status } = await json<unknown>(
			await app.request("/api/v1/cities?q=x", { headers }),
		);
		expect(status).toBe(422);
	});
});
