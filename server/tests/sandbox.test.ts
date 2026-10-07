import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { testDb } from "./helper.js";
import {
	authHeaders,
	createUser,
	makeTestContext,
	READER_PROFILE,
	truncateAll,
} from "./helper.js";
import { resolveAccount, subjectDigest } from "../src/services/accounts.js";
import { FIXTURE_EMAILS, fixtureCalendar, resetFixtures, seedFixtures } from "../src/services/fixtures.js";
import { accessCodes, identities, users } from "../src/db/schema.js";
import { and, eq } from "drizzle-orm";
import { dec, decJson, enc } from "../src/services/fields.js";
import { accessCodeDigest } from "../src/services/admissions.js";
import { completedOnboarding, type Profile } from "../src/services/profiles.js";

const PRIMARY = "test-primary-key-for-davar-server-only-0001";
const DETERMINISTIC = "test-deterministic-key-davar-only-0001";

const sandboxEnv = (extra: Record<string, string> = {}) =>
	({
		...process.env,
		NODE_ENV: "development",
		DAVAR_DEV_SANDBOX: "1",
		API_PUBLIC_URL: "http://localhost:3000",
		AUTH_RETURN_URIS: "davar://auth/callback",
		...extra,
	}) as NodeJS.ProcessEnv;

type FixturePersona = {
	id: string;
	admittedAt: Date | null;
	leaderVerified: boolean;
	discoverable: boolean;
	contactVisible: boolean;
	displayName: string | null;
	profile: Profile;
};

async function fixturePersona(
	db: ReturnType<typeof testDb>["db"],
	email: string,
): Promise<FixturePersona> {
	const digest = await subjectDigest(email, DETERMINISTIC);
	const identity = await db
		.select({ userId: identities.userId })
		.from(identities)
		.where(eq(identities.subjectDigest, digest))
		.limit(1);
	const userId = identity[0]?.userId;
	if (!userId) throw new Error(`Missing ${email}`);
	const row = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	const user = row[0];
	if (!user) throw new Error(`Missing ${email}`);
	return {
		id: user.id,
		admittedAt: user.admittedAt,
		leaderVerified: user.leaderVerified,
		discoverable: user.discoverable,
		contactVisible: user.contactVisible,
		displayName: user.displayName,
		profile: await decJson<Profile>(user.profile, PRIMARY, {}),
	};
}

async function fixtureAccessCode(db: ReturnType<typeof testDb>["db"], code: string) {
	const rows = await db
		.select()
		.from(accessCodes)
		.where(eq(accessCodes.codeDigest, await accessCodeDigest(code)))
		.limit(1);
	const row = rows[0];
	if (!row) throw new Error(`Missing access code ${code}`);
	return row;
}

beforeEach(truncateAll);

describe("development sandbox", () => {
	test("status and mailbox are disabled outside the sandbox", async () => {
		const { app } = makeTestContext();
		const status = await app.request("/api/v1/development/status");
		expect(status.status).toBe(404);
		const mailbox = await app.request("/development/mailbox");
		expect(mailbox.status).toBe(404);
	});

	test("sandbox captures synthetic mail and serves the inbox", async () => {
		const root = await mkdtemp(join(tmpdir(), "davar-sandbox-"));
		try {
			const { app, outbox } = makeTestContext({
				env: sandboxEnv(),
				outbox: undefined,
				rootDir: root,
			});
			void outbox;
			const start = await app.request("/api/v1/auth/email/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ return_uri: "davar://auth/callback", email: "fresh@example.test" }),
			});
			expect(start.status).toBe(200);
			const files = await readdir(join(root, "tmp", "sandbox-mail"));
			expect(files).toHaveLength(1);
			const message = JSON.parse(
				await readFile(join(root, "tmp", "sandbox-mail", files[0] as string), "utf8"),
			) as { to: string[]; subject: string };
			expect(message.to).toEqual(["fresh@example.test"]);

			const status = await app.request("/api/v1/development/status");
			expect(status.status).toBe(200);
			const payload = (await status.json()) as { sandbox: boolean; mailbox_url: string };
			expect(payload.sandbox).toBe(true);
			expect(payload.mailbox_url).toContain("/development/mailbox");

			const mailbox = await app.request("/development/mailbox");
			expect(mailbox.status).toBe(200);
			expect(await mailbox.text()).toContain("fresh@example.test");

			const real = await app.request("/api/v1/auth/email/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ return_uri: "davar://auth/callback", email: "real@example.org" }),
			});
			expect(real.status).toBe(500);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("fixtures repeat and reset only fixture-owned records", async () => {
		const db = testDb().db;
		const keys = {
			primaryKey: PRIMARY,
			deterministicKey: DETERMINISTIC,
			env: sandboxEnv(),
			nodeEnv: "development",
			rootDir: await mkdtemp(join(tmpdir(), "davar-fixtures-")),
		};
		try {
			await seedFixtures(db, keys);
			const digest = async (email: string) => subjectDigest(email, DETERMINISTIC);
			const digests = await Promise.all(FIXTURE_EMAILS.map(digest));
			const owned = await db.execute(
				sql`SELECT user_id AS "userId" FROM identities WHERE subject_digest IN (${sql.join(digests.map((d) => sql`${d}`), sql`, `)}) ORDER BY user_id`,
			);
			await seedFixtures(db, keys);
			const repeated = await db.execute(
				sql`SELECT user_id AS "userId" FROM identities WHERE subject_digest IN (${sql.join(digests.map((d) => sql`${d}`), sql`, `)}) ORDER BY user_id`,
			);
			expect(repeated).toEqual(owned);

			const unrelated = await createUser({ profile: READER_PROFILE });
			await resolveAccount(db, {
				provider: "google",
				subject: "unrelated",
				linkingUserId: unrelated,
				primaryKey: PRIMARY,
				deterministicKey: DETERMINISTIC,
			});
			await resetFixtures(db, keys);
			const kept = await db
				.select({ id: identities.userId })
				.from(identities)
				.where(eq(identities.subjectDigest, await subjectDigest("unrelated", DETERMINISTIC)))
				.limit(1);
			expect(kept).toHaveLength(1);
			const sandboxAssemblies = await db.execute(
				sql`SELECT count(*)::int AS count FROM assemblies WHERE source_id LIKE 'sandbox:%'`,
			);
			expect((sandboxAssemblies[0] as { count: number }).count).toBe(2);
			const fresh = await fixturePersona(db, "fresh@example.test");
			expect(fresh.admittedAt).toBeNull();
		} finally {
			await rm(keys.rootDir, { recursive: true, force: true });
		}
	});

	test("personas cover onboarding membership leadership privacy and scenario labels", async () => {
		const db = testDb().db;
		const keys = {
			primaryKey: PRIMARY,
			deterministicKey: DETERMINISTIC,
			env: sandboxEnv(),
			nodeEnv: "development",
			rootDir: await mkdtemp(join(tmpdir(), "davar-personas-")),
		};
		const scenarios = {
			fresh: "Invitation required; no onboarding",
			"onboarding-path": "Admitted; choose a path",
			"onboarding-questions": "Experienced path; resume after question 2",
			"onboarding-name": "Answers complete; name and gender required",
			"onboarding-city": "Name and gender complete; city required",
			"onboarding-visibility": "City selected; visibility review required",
			starting: "Starting path; may browse but cannot join",
			reader: "Join request pending in local assembly",
			"female-reader": "Experienced female reader; eligible to join",
			disagreed: "One negative answer; excluded from people discovery",
			member: "Local member; meeting access; cannot join elsewhere",
			declined: "Declined local request; may request again",
			left: "Left local assembly; may request again",
			"pending-online": "Online request pending",
			"legacy-city": "City label without coordinates; must select a city",
			applicant: "Unverified leader; request two endorsements",
			"applicant-pending": "Two pending endorsements",
			"applicant-one": "One accepted and one pending endorsement",
			"applicant-declined": "Declined endorsement; support required",
			"leader-one": "Verified local leader with members and requests",
			"leader-two": "Verified online leader with requests",
			"leader-create": "Verified leader without an assembly; can create",
			"nearby-hidden": "Jerusalem; hidden from people discovery",
			"nearby-visible": "Jerusalem; discoverable name and city only",
			"nearby-contact": "Jerusalem; discoverable with synthetic Telegram contact",
		};
		try {
			const seeded = await seedFixtures(db, keys);
			const labels: Record<string, string> = { ...seeded.assemblies_scenarios };
			expect(labels).toEqual(scenarios);
			expect(seeded.accounts).toEqual(Object.keys(scenarios).map((name) => `${name}@example.test`));
			expect(seeded.accounts).toHaveLength(25);
			expect(seeded.invitation).toBe("DAVAR-LOCAL");
			expect(seeded.valid_code).toBe("1234567");
			expect(seeded.invalid_invitations).toEqual({
				"7654321": "expired",
				"7654322": "revoked",
				"7654323": "exhausted",
			});

			const localCode = await fixtureAccessCode(db, "DAVAR-LOCAL");
			expect(localCode.revokedAt).toBeNull();
			expect(localCode.expiresAt.getTime()).toBeGreaterThan(Date.now());
			expect(localCode.maxUses).toBe(100);
			expect(localCode.uses).toBe(0);

			const validCode = await fixtureAccessCode(db, "1234567");
			expect(validCode.revokedAt).toBeNull();
			expect(validCode.expiresAt.getTime()).toBeGreaterThan(Date.now());
			expect(validCode.maxUses).toBe(100);
			expect(validCode.uses).toBe(0);

			const expiredCode = await fixtureAccessCode(db, "7654321");
			expect(expiredCode.expiresAt.getTime()).toBeLessThan(Date.now());
			expect(expiredCode.revokedAt).toBeNull();
			expect(expiredCode.maxUses).toBe(1);
			expect(expiredCode.uses).toBe(0);

			const revokedCode = await fixtureAccessCode(db, "7654322");
			expect(revokedCode.revokedAt).not.toBeNull();
			expect(revokedCode.expiresAt.getTime()).toBeGreaterThan(Date.now());
			expect(revokedCode.maxUses).toBe(1);
			expect(revokedCode.uses).toBe(0);

			const exhaustedCode = await fixtureAccessCode(db, "7654323");
			expect(exhaustedCode.revokedAt).toBeNull();
			expect(exhaustedCode.expiresAt.getTime()).toBeGreaterThan(Date.now());
			expect(exhaustedCode.maxUses).toBe(1);
			expect(exhaustedCode.uses).toBe(1);

			const loaded = Object.fromEntries(
				await Promise.all(
					seeded.accounts.map(async (email) => {
						const name = email.split("@")[0] as string;
						return [name, await fixturePersona(db, email)] as const;
					}),
				),
			);
			expect(Object.keys(loaded)).toHaveLength(25);
			for (const name of [
				"onboarding-path",
				"onboarding-questions",
				"onboarding-name",
				"onboarding-city",
				"onboarding-visibility",
			]) {
				const user = loaded[name] as FixturePersona;
				expect(user.admittedAt).toBeTruthy();
				expect(completedOnboarding(user.profile)).toBe(false);
			}
			expect(loaded["onboarding-questions"]?.profile.answers?.["2"]).toBe(false);
			expect(loaded["female-reader"]?.profile.gender).toBe("female");
			expect(completedOnboarding(loaded["legacy-city"]?.profile as Profile)).toBe(true);
			expect(loaded["legacy-city"]?.profile.latitude).toBeUndefined();

			for (const [name, state, sourceId] of [
				["reader", "requested", "sandbox:local"],
				["member", "member", "sandbox:local"],
				["declined", "declined", "sandbox:local"],
				["left", "left", "sandbox:local"],
				["pending-online", "requested", "sandbox:online"],
			] as const) {
				const rows = await db.execute(sql`
					SELECT m.state, a.source_id AS "sourceId"
					FROM memberships m
					JOIN assemblies a ON a.id = m.assembly_id
					WHERE m.user_id = ${(loaded[name] as FixturePersona).id}
				`);
				expect(
					rows.map((row) => ({
						state: (row as { state: string }).state,
						sourceId: (row as { sourceId: string }).sourceId,
					})),
				).toEqual([{ state, sourceId }]);
			}

			for (const [name, states] of [
				["applicant-pending", ["requested", "requested"]],
				["applicant-one", ["accepted", "requested"]],
				["applicant-declined", ["declined", "requested"]],
			] as const) {
				const rows = await db.execute(sql`
					SELECT state FROM endorsements
					WHERE applicant_id = ${(loaded[name] as FixturePersona).id}
					ORDER BY state
				`);
				expect(rows.map((row) => (row as { state: string }).state).sort()).toEqual([...states].sort());
			}

			const leaderCreate = loaded["leader-create"] as FixturePersona;
			expect(leaderCreate.leaderVerified).toBe(true);
			const leaderMemberships = await db.execute(sql`
				SELECT id FROM memberships WHERE user_id = ${leaderCreate.id}
			`);
			expect(leaderMemberships).toHaveLength(0);
			expect(loaded["nearby-hidden"]?.discoverable).toBe(false);
			expect(loaded["nearby-visible"]?.discoverable).toBe(true);
			expect(loaded["nearby-visible"]?.contactVisible).toBe(false);
			expect(loaded["nearby-contact"]?.contactVisible).toBe(true);
			const telegram = await db
				.select({ subject: identities.subject })
				.from(identities)
				.where(
					and(
						eq(identities.userId, (loaded["nearby-contact"] as FixturePersona).id),
						eq(identities.provider, "telegram"),
					),
				);
			expect(telegram).toHaveLength(1);
			expect(await dec(telegram[0]?.subject, PRIMARY)).toBe("990000000001");

			const membershipsBefore = await db.execute(sql`SELECT count(*)::int AS count FROM memberships`);
			const endorsementsBefore = await db.execute(sql`SELECT count(*)::int AS count FROM endorsements`);
			await db
				.update(users)
				.set({
					displayName: await enc("Changed during QA", PRIMARY),
					discoverable: true,
				})
				.where(eq(users.id, (loaded["female-reader"] as FixturePersona).id));
			await seedFixtures(db, keys);
			const female = await fixturePersona(db, "female-reader@example.test");
			expect(await dec(female.displayName, PRIMARY)).toBe("Changed during QA");
			expect(female.discoverable).toBe(true);
			expect(await db.execute(sql`SELECT count(*)::int AS count FROM memberships`)).toEqual(membershipsBefore);
			expect(await db.execute(sql`SELECT count(*)::int AS count FROM endorsements`)).toEqual(endorsementsBefore);
			const expiredAgain = await fixtureAccessCode(db, "7654321");
			expect(expiredAgain.expiresAt.getTime()).toBe(expiredCode.expiresAt.getTime());
			expect(expiredAgain.uses).toBe(0);
			expect((await fixtureAccessCode(db, "7654322")).revokedAt?.getTime()).toBe(revokedCode.revokedAt?.getTime());
			expect((await fixtureAccessCode(db, "7654323")).uses).toBe(1);
			expect((await fixtureAccessCode(db, "DAVAR-LOCAL")).maxUses).toBe(100);
			expect((await fixtureAccessCode(db, "1234567")).uses).toBe(0);
		} finally {
			await rm(keys.rootDir, { recursive: true, force: true });
		}
	});

	test("sandbox calendar scenarios keep month boundaries", async () => {
		const db = testDb().db;
		const keys = {
			primaryKey: PRIMARY,
			deterministicKey: DETERMINISTIC,
			env: sandboxEnv(),
			nodeEnv: "development",
		};
		await seedFixtures(db, { ...keys, rootDir: await mkdtemp(join(tmpdir(), "davar-cal-")) });
		const confirmed = await fixtureCalendar(db, keys, "confirmed");
		expect(confirmed).toMatchObject({ scenario: "confirmed", synthetic: true, aviv: "unresolved" });
		const { app, deps } = makeTestContext({ env: sandboxEnv() });
		deps.env = sandboxEnv();
		const res = await app.request(
			`/api/v1/calendar/today?${new URLSearchParams({
				instant: new Date().toISOString(),
				latitude: "31.78",
				longitude: "35.23",
				timezone: "Asia/Jerusalem",
			}).toString()}`,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { days: Array<{ biblical: { day: unknown } }> };
		expect(body.days[0]?.biblical.day).toBeTruthy();
		await fixtureCalendar(db, keys, "pending");
		const remaining = await db.execute(
			sql`SELECT count(*)::int AS count FROM new_moon_observations WHERE source_id LIKE 'sandbox:%'`,
		);
		expect((remaining[0] as { count: number }).count).toBe(0);
		await expect(fixtureCalendar(db, keys, "bogus")).rejects.toThrow();
	});

	test("simulated commentary refunds failures and stays bounded", async () => {
		const { app } = makeTestContext({ env: sandboxEnv() });
		const userId = await createUser({ profile: {} });
		const headers = await authHeaders(userId);
		const created = (await (
			await app.request("/api/v1/conversations", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Synthetic" }),
			})
		).json()) as { id: string };
		const failed = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Trigger [sandbox:failure] now", request_id: "failure_001" }),
		});
		expect(failed.status).toBe(503);
		expect(await failed.json()).toEqual({ error: { code: "development_simulated_failure" } });

		const ok = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Hello", request_id: "success_001" }),
		});
		expect(ok.status).toBe(200);
		const answer = (await ok.json()) as {
			id: string;
			content: string;
			generation: Record<string, unknown>;
		};
		expect(answer.content).toContain("Development simulation");
		expect(answer.generation.development_simulation).toBe(true);

		const same = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Hello", request_id: "success_001" }),
		});
		expect(((await same.json()) as { id: string }).id).toBe(answer.id);

		const capped = await app.request(`/api/v1/conversations/${created.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: "Again", request_id: "success_002" }),
		});
		expect(capped.status).toBe(402);
	});
});
