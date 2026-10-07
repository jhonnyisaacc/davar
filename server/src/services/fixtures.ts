import { eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import {
	accessCodes,
	articles,
	assemblies,
	calendarFeedStates,
	identities,
	memberships,
	newMoonObservations,
	users,
} from "../db/schema.js";
import { FEED_SOURCE } from "./feedState.js";
import { sha256Hex } from "../lib/crypto.js";
import { requireSandbox } from "./sandbox.js";
import { resolveAccount, subjectDigest } from "./accounts.js";
import { accessCodeDigest } from "./admissions.js";
import { enc, encJson } from "./fields.js";

export const FIXTURE_EMAILS = [
	"fresh@example.test",
	"starting@example.test",
	"reader@example.test",
	"applicant@example.test",
	"leader-one@example.test",
	"leader-two@example.test",
];

export const FIXTURE_INVITATION = "DAVAR-LOCAL";

export interface FixtureKeys {
	primaryKey: string;
	deterministicKey: string;
	env?: NodeJS.ProcessEnv;
	nodeEnv?: string;
	rootDir?: string;
}

function pathFor(name: string): string {
	if (name === "starting") return "starting";
	if (name.startsWith("leader") || name === "applicant") return "leader";
	return "experienced";
}

export async function seedFixtures(
	db: DatabaseOrTx,
	keys: FixtureKeys,
): Promise<{ accounts: string[]; invitation: string; provider_key: string; provider_model: string }> {
	requireSandbox(keys.env, keys.nodeEnv);
	for (const email of FIXTURE_EMAILS) {
		const existing = await db
			.select({ userId: identities.userId })
			.from(identities)
			.where(eq(identities.subjectDigest, await subjectDigest(email, keys.deterministicKey)))
			.limit(1);
		if (existing[0]) continue;
		const name = email.split("@")[0] as string;
		const user = await resolveAccount(db, {
			provider: "email",
			subject: email,
			primaryKey: keys.primaryKey,
			deterministicKey: keys.deterministicKey,
		});
		const path = pathFor(name);
		const profile =
			name === "fresh"
				? {}
				: {
						experience: path,
						city: "Buenos Aires",
						latitude: -34.6,
						longitude: -58.4,
						gender: "male",
						visibility_reviewed: true,
						answers: Object.fromEntries(
							(path === "starting" ? [1, 3] : [1, 2, 3, 4, 5, 6, 7]).map((n) => [String(n), true]),
						),
					};
		await db
			.update(users)
			.set({
				displayName: await enc(`Sandbox ${name}`, keys.primaryKey),
				profile: await encJson(profile, keys.primaryKey),
				admittedAt: name === "fresh" ? null : new Date(),
				leaderVerified: name.startsWith("leader"),
				discoverable: false,
				updatedAt: new Date(),
			})
			.where(eq(users.id, user.id));
	}
	const codeDigest = await accessCodeDigest(FIXTURE_INVITATION);
	const existingCode = await db
		.select()
		.from(accessCodes)
		.where(eq(accessCodes.codeDigest, codeDigest))
		.limit(1);
	if (!existingCode[0] || (existingCode[0].expiresAt?.getTime() ?? 0) <= Date.now()) {
		if (!existingCode[0]) {
			await db.insert(accessCodes).values({
				codeDigest,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
				maxUses: 100,
			});
		} else {
			await db
				.update(accessCodes)
				.set({ expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), updatedAt: new Date() })
				.where(eq(accessCodes.id, existingCode[0].id));
		}
	}
	const leaderOne = await db
		.select({ userId: identities.userId })
		.from(identities)
		.where(eq(identities.subjectDigest, await subjectDigest("leader-one@example.test", keys.deterministicKey)))
		.limit(1);
	const leaderTwo = await db
		.select({ userId: identities.userId })
		.from(identities)
		.where(eq(identities.subjectDigest, await subjectDigest("leader-two@example.test", keys.deterministicKey)))
		.limit(1);
	const reader = await db
		.select({ userId: identities.userId })
		.from(identities)
		.where(eq(identities.subjectDigest, await subjectDigest("reader@example.test", keys.deterministicKey)))
		.limit(1);
	const defs = [
		{ sourceId: "sandbox:local", name: "Sandbox Buenos Aires", kind: "in_person", leader: leaderOne[0]?.userId },
		{ sourceId: "sandbox:online", name: "Sandbox Online", kind: "online", leader: leaderTwo[0]?.userId },
	] as const;
	for (const def of defs) {
		if (!def.leader) continue;
		const found = await db
			.select({ id: assemblies.id })
			.from(assemblies)
			.where(eq(assemblies.sourceId, def.sourceId))
			.limit(1);
		if (found[0]) continue;
		const created = await db
			.insert(assemblies)
			.values({
				sourceId: def.sourceId,
				name: def.name,
				kind: def.kind,
				leaderId: def.leader,
				city: def.kind === "in_person" ? "Buenos Aires" : null,
				latitude: def.kind === "in_person" ? "-34.60" : null,
				longitude: def.kind === "in_person" ? "-58.40" : null,
				meetingUrl: await enc("https://example.test/synthetic-meeting", keys.primaryKey),
			})
			.returning({ id: assemblies.id });
		const assembly = created[0];
		if (assembly) {
			await db.insert(memberships).values({ userId: def.leader, assemblyId: assembly.id, state: "member" });
		}
	}
	if (reader[0]) {
		const local = await db
			.select({ id: assemblies.id })
			.from(assemblies)
			.where(eq(assemblies.sourceId, "sandbox:local"))
			.limit(1);
		if (local[0]) {
			const mine = await db.execute(sql`
				SELECT id FROM memberships WHERE user_id = ${reader[0].userId} AND assembly_id = ${local[0].id} LIMIT 1
			`);
			if (!mine[0]) {
				await db.insert(memberships).values({
					userId: reader[0].userId as string,
					assemblyId: local[0].id,
					state: "requested",
				});
			}
		}
	}
	const article = await db
		.select({ id: articles.id })
		.from(articles)
		.where(eq(articles.sourceId, "sandbox:article"))
		.limit(1);
	if (!article[0]) {
		await db.insert(articles).values({
			sourceId: "sandbox:article",
			title: "Development article — synthetic content",
			locale: "en",
			sourceUrl: "https://example.test/sandbox/article",
			attribution: "Davar development fixture; not Shaul or Scripture",
			revision: "fixture-v1",
			inputHash: await sha256Hex("fixture-v1"),
			publicationState: "published",
			permissions: { public_display: true, ai_grounding: true },
			references: [{ system_id: "davar-v1", kind: "verse", book_id: "john", chapter: 1, verse: 1 }],
			body: await enc(
				"Synthetic article for testing display, attribution and source handoff. No theological claim is made.",
				keys.primaryKey,
			),
		});
	}
	return {
		accounts: FIXTURE_EMAILS,
		invitation: FIXTURE_INVITATION,
		provider_key: "sandbox-key",
		provider_model: "development-fixture-v1",
	};
}

export async function resetFixtures(
	db: DatabaseOrTx,
	keys: FixtureKeys,
): Promise<{ reset: boolean }> {
	requireSandbox(keys.env, keys.nodeEnv);
	const digests = await Promise.all(
		FIXTURE_EMAILS.map((email) => subjectDigest(email, keys.deterministicKey)),
	);
	for (const digest of digests) {
		const rows = await db
			.select({ userId: identities.userId })
			.from(identities)
			.where(eq(identities.subjectDigest, digest))
			.limit(1);
		for (const row of rows) {
			await db.execute(sql`DELETE FROM assemblies WHERE leader_id = ${row.userId} OR source_id IN ('sandbox:local', 'sandbox:online')`);
			await db.execute(sql`DELETE FROM auth_attempts WHERE user_id = ${row.userId} OR email IN (${sql.join(FIXTURE_EMAILS.map((email) => sql`${email}`), sql`, `)})`);
			await db.execute(
				sql`DELETE FROM endorsements WHERE applicant_id = ${row.userId} OR leader_id = ${row.userId}`,
			);
			await db.execute(sql`DELETE FROM users WHERE id = ${row.userId}`);
		}
	}
	await db.execute(sql`DELETE FROM auth_attempts WHERE provider = 'email'`);
	await db.execute(sql`DELETE FROM articles WHERE source_id LIKE 'sandbox:%'`);
	await db.execute(sql`DELETE FROM new_moon_observations WHERE source_id LIKE 'sandbox:%'`);
	await db.execute(sql`DELETE FROM access_codes WHERE code_digest = ${await accessCodeDigest(FIXTURE_INVITATION)}`);
	const { rm } = await import("node:fs/promises");
	const { join } = await import("node:path");
	try {
		await rm(join(keys.rootDir ?? process.cwd(), "tmp", "sandbox-mail"), {
			recursive: true,
			force: true,
		});
	} catch {
		// Mailbox is best-effort during reset.
	}
	await seedFixtures(db, keys);
	return { reset: true };
}

export async function fixtureCalendar(
	db: DatabaseOrTx,
	keys: FixtureKeys,
	scenario: string,
): Promise<{ scenario: string; synthetic: boolean; aviv: string }> {
	requireSandbox(keys.env, keys.nodeEnv);
	if (scenario !== "live" && scenario !== "pending" && scenario !== "confirmed") {
		throw new Error("Choose live, pending or confirmed");
	}
	const existing = await db
		.select({ id: calendarFeedStates.id })
		.from(calendarFeedStates)
		.where(eq(calendarFeedStates.source, FEED_SOURCE))
		.limit(1);
	if (existing[0]) {
		await db
			.update(calendarFeedStates)
			.set({ developmentScenario: scenario, updatedAt: new Date() })
			.where(eq(calendarFeedStates.id, existing[0].id));
	} else {
		await db.insert(calendarFeedStates).values({ source: FEED_SOURCE, developmentScenario: scenario });
	}
	await db.execute(sql`DELETE FROM new_moon_observations WHERE source_id LIKE 'sandbox:%'`);
	if (scenario === "confirmed") {
		const day = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
		const observedOn = day.toISOString().slice(0, 10);
		const created = await db
			.insert(newMoonObservations)
			.values({
				sourceId: "sandbox:synthetic-observation",
				source: "israeli_new_moon_society",
				sourceUrl: "https://example.test/synthetic-observation",
				observedOn,
				country: "IL",
				visibilityMethod: "unaided",
				verified: true,
				inputHash: await sha256Hex(observedOn),
				provenance: {
					development_fixture: true,
					observer: "Synthetic fixture — not a real INMS observation",
				},
			})
			.returning({ id: newMoonObservations.id });
		const observation = created[0];
		if (observation) {
			const { monthConfirmations } = await import("../db/schema.js");
			await db.insert(monthConfirmations).values({
				newMoonObservationId: observation.id,
				startsOnEvening: observedOn,
			});
		}
	}
	return { scenario, synthetic: scenario !== "live", aviv: "unresolved" };
}
