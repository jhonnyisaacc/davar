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
import { fixtureCalendar, resetFixtures, seedFixtures } from "../src/services/fixtures.js";
import { identities } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

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
			const digests = await Promise.all(
				[
					"fresh@example.test",
					"starting@example.test",
					"reader@example.test",
					"applicant@example.test",
					"leader-one@example.test",
					"leader-two@example.test",
				].map(digest),
			);
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
