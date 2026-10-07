import { beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helper.js";
import { createUser, makeTestContext, truncateAll } from "./helper.js";
import {
	articleImport,
	observationImport,
	qahalImport,
} from "../src/services/imports.js";
import { recoverConsultations } from "../src/services/recover.js";
import { deliverTelegramNotifications } from "../src/services/notify.js";
import { syncCalendarObservations } from "../src/services/calendarSync.js";
import { resolveAccount, subjectDigest } from "../src/services/accounts.js";
import { conversations, identities, messages, newMoonObservations, notifications, users } from "../src/db/schema.js";
import { enc } from "../src/services/fields.js";

const PRIMARY = "test-primary-key-for-davar-server-only-0001";
const DETERMINISTIC = "test-deterministic-key-davar-only-0001";

beforeEach(truncateAll);

function qahalPayload() {
	return {
		schema_version: 1,
		source_revision: "fixture-revision",
		decrypted: true,
		users: [
			{ telegram_id: 12345, display_name: "Fixture", profile: { city: "City" } },
		],
		assemblies: [
			{ id: "fixture", leader_telegram_id: 12345, name: "Fixture", kind: "online" },
		],
		memberships: [],
	};
}

describe("imports", () => {
	test("reviewed Qahal export rolls back dry runs and replays idempotently", async () => {
		const db = testDb().db;
		const keys = { primaryKey: PRIMARY, deterministicKey: DETERMINISTIC };
		const count = async () =>
			(await db.execute(sql`SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM assemblies) AS assemblies`))[0] as {
				users: number;
				assemblies: number;
			};
		const before = await count();
		const dry = await qahalImport(db, qahalPayload(), keys);
		expect(dry.users).toBe(1);
		expect(await count()).toEqual(before);

		await qahalImport(db, qahalPayload(), keys, false);
		const after = await count();
		expect(after.users).toBe(before.users + 1);
		await qahalImport(db, qahalPayload(), keys, false);
		expect(await count()).toEqual(after);

		const user = await db
			.select({ userId: identities.userId })
			.from(identities)
			.where(eq(identities.subjectDigest, await subjectDigest("12345", DETERMINISTIC)))
			.limit(1);
		const row = await db.select().from(users).where(eq(users.id, user[0]?.userId ?? "")).limit(1);
		expect(row[0]?.leaderVerified).toBe(false);
		expect(row[0]?.admittedAt).toBe(null);
		expect(row[0]?.discoverable).toBe(false);

		await expect(qahalImport(db, { ...qahalPayload(), decrypted: false }, keys)).rejects.toThrow();
	});

	test("observation import preserves provenance and retracts confirmations", async () => {
		const db = testDb().db;
		const payload = {
			schema_version: 1,
			observations: [
				{
					id: "inms:fixture",
					source: "israeli_new_moon_society",
					source_url: "https://moonsocil.blogspot.com/fixture",
					observed_on: "2026-09-12",
					country: "IL",
					visibility_method: "unaided",
					verified: true,
					raw_source_hash: "fixture-hash",
					observer: "Public witness",
					location: "Israel",
				},
			],
		};
		const before = await db.execute(
			sql`SELECT count(*)::int AS count FROM new_moon_observations`,
		);
		await observationImport(db, payload);
		const same = await db.execute(
			sql`SELECT count(*)::int AS count FROM new_moon_observations`,
		);
		expect(same).toEqual(before);

		await observationImport(db, payload, false);
		const stored = await db.select().from(newMoonObservations).limit(1);
		expect((stored[0]?.provenance as Record<string, unknown>).observer).toBe("Public witness");
		const confirmations = await db.execute(
			sql`SELECT count(*)::int AS count FROM month_confirmations`,
		);
		await observationImport(db, payload, false);
		const again = await db.execute(
			sql`SELECT count(*)::int AS count FROM month_confirmations`,
		);
		expect(again).toEqual(confirmations);

		const retracted = structuredClone(payload);
		retracted.observations[0]!.verified = false;
		const confBefore = (
			(await db.execute(sql`SELECT count(*)::int AS count FROM month_confirmations`))[0] as {
				count: number;
			}
		).count;
		await observationImport(db, retracted, false);
		const confAfter = (
			(await db.execute(sql`SELECT count(*)::int AS count FROM month_confirmations`))[0] as {
				count: number;
			}
		).count;
		expect(confAfter).toBe(confBefore - 1);
	});

	test("article import only accepts public Shaul sources", async () => {
		const db = testDb().db;
		const keys = { primaryKey: PRIMARY, deterministicKey: DETERMINISTIC };
		const payload = {
			schema_version: 1,
			source_revision: "rev-2",
			articles: [
				{
					source_id: "shaul:note:ok",
					title: "Ok",
					locale: "en",
					body: "Body",
					source_url: "https://shaul.vercel.app/ok",
					attribution: "Author",
					references: [
						{ system_id: "davar-v1", kind: "verse", book_id: "john", chapter: 1, verse: 1 },
					],
				},
			],
		};
		const dry = await articleImport(db, payload, keys);
		expect(dry.articles).toBe(1);
		await expect(
			articleImport(
				db,
				{
					...payload,
					articles: [{ ...payload.articles[0]!, source_id: "private:note" }],
				},
				keys,
			),
		).rejects.toThrow();
	});
});

describe("jobs", () => {
	test("interrupted consultation recovery is idempotent", async () => {
		const db = testDb().db;
		const userId = await createUser({ freeConsultations: 1 });
		const convo = await db
			.insert(conversations)
			.values({ userId, title: await enc("Fixture", PRIMARY) })
			.returning({ id: conversations.id });
		const message = await db
			.insert(messages)
			.values({
				conversationId: convo[0]?.id ?? "",
				role: "assistant",
				content: await enc("Pending", PRIMARY),
				state: "pending",
				generation: { sponsored: true },
			})
			.returning({ id: messages.id });
		await db.execute(
			sql`UPDATE messages SET created_at = now() - interval '11 minutes' WHERE id = ${message[0]?.id}`,
		);
		await recoverConsultations(db, PRIMARY);
		await recoverConsultations(db, PRIMARY);
		const fresh = await db.select().from(messages).where(eq(messages.id, message[0]?.id ?? "")).limit(1);
		expect(fresh[0]?.state).toBe("failed");
		const owner = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		expect(owner[0]?.freeConsultations).toBe(0);
	});

	test("telegram delivery skips without configuration and delivers when configured", async () => {
		const { deps } = makeTestContext();
		const skipped = await deliverTelegramNotifications(testDb().db, { env: deps.env });
		expect(skipped).toEqual({ delivered: 0, attempted: 0, skipped: true });

		const userId = await createUser({ settings: { telegram_notifications: true } });
		await resolveAccount(testDb().db, {
			provider: "telegram",
			subject: "777001",
			linkingUserId: userId,
			primaryKey: PRIMARY,
			deterministicKey: DETERMINISTIC,
		});
		await testDb()
			.db.insert(notifications)
			.values({ userId, kind: "join_requested", data: {} });
		const sent: Array<{ url: string; body: unknown }> = [];
		const delivered = await deliverTelegramNotifications(testDb().db, {
			env: { ...deps.env, TELEGRAM_BOT_TOKEN: "bot-token" } as NodeJS.ProcessEnv,
			primaryKey: PRIMARY,
			http: {
				json: async (url: string, options?: { body?: unknown }) => {
					sent.push({ url, body: options?.body });
					return { ok: true };
				},
			},
		});
		expect(delivered).toEqual({ delivered: 1, attempted: 1, skipped: false });
		expect(sent[0]?.url).toContain("botbot-token/sendMessage");
		expect(sent[0]?.body).toMatchObject({ chat_id: "777001" });
		const rows = await testDb().db.select().from(notifications).limit(1);
		expect(rows[0]?.deliveredAt).not.toBe(null);
	});

	test("calendar sync never invents provenance", async () => {
		const idle = await syncCalendarObservations(testDb().db, {});
		expect(idle).toEqual({ synced: 0, confirmations: 0, status: "not_configured" });
		const dry = await syncCalendarObservations(testDb().db, {
			payload: { schema_version: 1, observations: [] },
		});
		expect(dry.status).toBe("dry_run");
	});
});
