import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { accessCodes, endorsements, users } from "../src/db/schema.js";
import { accessCodeDigest } from "../src/services/admissions.js";
import {
	issueInvitation,
	LEADER_ELIGIBILITY_ERROR,
	verifyLeader,
} from "../src/services/operators.js";
import {
	createUser,
	READER_PROFILE,
	TEST_DATABASE_URL,
	testConfig,
	testDb,
	truncateAll,
} from "./helper.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIMARY = testConfig().encryptionPrimaryKey;
const DETERMINISTIC = testConfig().encryptionDeterministicKey;

const LEADER_PROFILE = {
	...READER_PROFILE,
	experience: "leader" as const,
};

beforeEach(truncateAll);

async function runCommand(
	script: string,
	extra: Record<string, string | undefined> = {},
): Promise<{ out: string; err: string; code: number }> {
	const env: Record<string, string | undefined> = {
		...process.env,
		NODE_ENV: "test",
		DATABASE_URL: TEST_DATABASE_URL,
		DAVAR_ENCRYPTION_PRIMARY_KEY: PRIMARY,
		DAVAR_ENCRYPTION_DETERMINISTIC_KEY: DETERMINISTIC,
		...extra,
	};
	if (!Object.prototype.hasOwnProperty.call(extra, "USER_ID")) delete env.USER_ID;
	const proc = Bun.spawn([process.execPath, script], {
		cwd: join(import.meta.dir, ".."),
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { out, err, code };
}

describe("operator invitation", () => {
	test("stores a zero-padded 7-digit code for 30 days and 100 uses", async () => {
		const now = new Date("2026-10-07T12:00:00.000Z");
		const code = await issueInvitation(testDb().db, { now, value: 42 });
		expect(code).toBe("0000042");
		const row = await testDb()
			.db.select()
			.from(accessCodes)
			.where(eq(accessCodes.codeDigest, await accessCodeDigest(code)))
			.limit(1);
		expect(row[0]?.maxUses).toBe(100);
		expect(row[0]?.uses).toBe(0);
		expect(row[0]?.revokedAt ?? null).toBeNull();
		expect(row[0]?.expiresAt?.toISOString()).toBe("2026-11-06T12:00:00.000Z");
	});

	test("operator:issue-invitation prints the code it stores", async () => {
		const before = Date.now();
		const result = await runCommand("src/jobs/issue-invitation.ts");
		const after = Date.now();
		expect(result.code).toBe(0);
		expect(result.out).toMatch(/^\d{7}\n$/);
		const code = result.out.trim();
		const row = await testDb()
			.db.select()
			.from(accessCodes)
			.where(eq(accessCodes.codeDigest, await accessCodeDigest(code)))
			.limit(1);
		expect(row[0]?.maxUses).toBe(100);
		expect(row[0]?.uses).toBe(0);
		expect(row[0]?.revokedAt ?? null).toBeNull();
		const expires = row[0]?.expiresAt?.getTime() ?? 0;
		expect(expires).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
		expect(expires).toBeLessThanOrEqual(after + 30 * DAY_MS);
		const count = await testDb().db.execute(
			sql`SELECT count(*)::int AS count FROM access_codes`,
		);
		expect((count[0] as { count: number }).count).toBe(1);
	});
});

describe("operator verify leader", () => {
	test("sets leader_verified for an onboarded male leader", async () => {
		const id = await createUser({ profile: LEADER_PROFILE, leaderVerified: false });
		await verifyLeader(testDb().db, id, PRIMARY);
		const row = await testDb().db.select().from(users).where(eq(users.id, id)).limit(1);
		expect(row[0]?.leaderVerified).toBe(true);
		expect(await testDb().db.select().from(endorsements)).toEqual([]);
	});

	test("refuses anyone who is not an onboarded male leader", async () => {
		const reader = await createUser({ profile: READER_PROFILE });
		const female = await createUser({
			profile: { ...LEADER_PROFILE, gender: "female" },
		});
		const incomplete = await createUser({
			profile: { ...LEADER_PROFILE, visibility_reviewed: false },
		});
		for (const id of [reader, female, incomplete]) {
			await expect(verifyLeader(testDb().db, id, PRIMARY)).rejects.toThrow(
				LEADER_ELIGIBILITY_ERROR,
			);
			const row = await testDb().db.select().from(users).where(eq(users.id, id)).limit(1);
			expect(row[0]?.leaderVerified).toBe(false);
		}
		expect(await testDb().db.select().from(endorsements)).toEqual([]);
	});

	test("operator:verify-leader requires USER_ID and an existing eligible user", async () => {
		const missing = await runCommand("src/jobs/verify-leader.ts");
		expect(missing.code).not.toBe(0);
		expect(`${missing.err}\n${missing.out}`).toContain("USER_ID is required");

		const unknown = await runCommand("src/jobs/verify-leader.ts", {
			USER_ID: "00000000-0000-0000-0000-000000000000",
		});
		expect(unknown.code).not.toBe(0);
		expect(`${unknown.err}\n${unknown.out}`).toContain(
			"Couldn't find User with 'id'=00000000-0000-0000-0000-000000000000",
		);

		const malformed = await runCommand("src/jobs/verify-leader.ts", { USER_ID: "nope" });
		expect(malformed.code).not.toBe(0);
		expect(`${malformed.err}\n${malformed.out}`).toContain("Couldn't find User with 'id'=nope");

		const reader = await createUser({ profile: READER_PROFILE });
		const refused = await runCommand("src/jobs/verify-leader.ts", { USER_ID: reader });
		expect(refused.code).not.toBe(0);
		expect(`${refused.err}\n${refused.out}`).toContain(LEADER_ELIGIBILITY_ERROR);
		const still = await testDb().db.select().from(users).where(eq(users.id, reader)).limit(1);
		expect(still[0]?.leaderVerified).toBe(false);

		const leader = await createUser({ profile: LEADER_PROFILE, leaderVerified: false });
		const verified = await runCommand("src/jobs/verify-leader.ts", { USER_ID: leader });
		expect(verified.code).toBe(0);
		expect(verified.out).toBe("");
		const row = await testDb().db.select().from(users).where(eq(users.id, leader)).limit(1);
		expect(row[0]?.leaderVerified).toBe(true);
		expect(await testDb().db.select().from(endorsements)).toEqual([]);
	});
});
