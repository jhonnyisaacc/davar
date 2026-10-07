import { eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import {
	accessCodes,
	articles,
	assemblies,
	calendarFeedStates,
	endorsements,
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
import type { Profile } from "./profiles.js";

export const FIXTURE_SCENARIOS = {
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
} as const;

export const FIXTURE_EMAILS = Object.keys(FIXTURE_SCENARIOS).map((name) => `${name}@example.test`);

export const FIXTURE_INVITATION = "DAVAR-LOCAL";
export const FIXTURE_VALID_CODE = "1234567";
export const FIXTURE_INVALID_INVITATIONS = {
	"7654321": "expired",
	"7654322": "revoked",
	"7654323": "exhausted",
} as const;

export interface FixtureKeys {
	primaryKey: string;
	deterministicKey: string;
	env?: NodeJS.ProcessEnv;
	nodeEnv?: string;
	rootDir?: string;
}

function pathFor(name: string): "starting" | "experienced" | "leader" {
	if (name === "starting") return "starting";
	if (name.startsWith("leader") || name.startsWith("applicant")) return "leader";
	return "experienced";
}

function trueAnswers(numbers: number[]): Record<string, boolean> {
	return Object.fromEntries(numbers.map((number) => [String(number), true]));
}

function fixtureProfile(name: string): Profile {
	const path = pathFor(name);
	let profile: Profile =
		name === "fresh"
			? {}
			: {
					experience: path,
					city: "Buenos Aires",
					latitude: -34.6,
					longitude: -58.4,
					gender: "male",
					visibility_reviewed: true,
					answers: trueAnswers(path === "starting" ? [1, 3] : [1, 2, 3, 4, 5, 6, 7]),
				};
	if (name === "onboarding-path") profile = {};
	else if (name === "onboarding-questions") {
		profile = { experience: path, answers: { "1": true, "2": false } };
	} else if (name === "onboarding-name") {
		profile = { experience: path, answers: trueAnswers([1, 2, 3, 4, 5, 6, 7]) };
	} else if (name === "onboarding-city") {
		delete profile.city;
		delete profile.latitude;
		delete profile.longitude;
		delete profile.visibility_reviewed;
	} else if (name === "onboarding-visibility") {
		delete profile.visibility_reviewed;
	} else if (name === "female-reader") {
		profile = { ...profile, gender: "female" };
	} else if (name === "disagreed") {
		profile = { ...profile, answers: { ...profile.answers, "2": false } };
	} else if (name === "legacy-city") {
		delete profile.latitude;
		delete profile.longitude;
	}
	if (name.startsWith("nearby-")) {
		profile = { ...profile, city: "Jerusalem", latitude: 31.8, longitude: 35.25 };
	}
	if (name === "reader") profile = { ...profile, birth_date: "1990-01-01" };
	return profile;
}

async function fixtureUserId(
	db: DatabaseOrTx,
	email: string,
	deterministicKey: string,
): Promise<string> {
	const rows = await db
		.select({ userId: identities.userId })
		.from(identities)
		.where(eq(identities.subjectDigest, await subjectDigest(email, deterministicKey)))
		.limit(1);
	const userId = rows[0]?.userId;
	if (!userId) throw new Error(`Missing sandbox account ${email}`);
	return userId;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function ensureOpenCode(db: DatabaseOrTx, code: string): Promise<void> {
	const codeDigest = await accessCodeDigest(code);
	const existingCode = await db
		.select()
		.from(accessCodes)
		.where(eq(accessCodes.codeDigest, codeDigest))
		.limit(1);
	const row = existingCode[0];
	if (!row || (row.expiresAt?.getTime() ?? 0) <= Date.now()) {
		const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
		if (!row) {
			await db.insert(accessCodes).values({ codeDigest, expiresAt, maxUses: 100 });
		} else {
			await db
				.update(accessCodes)
				.set({ expiresAt, updatedAt: new Date() })
				.where(eq(accessCodes.id, row.id));
		}
	}
}

async function ensureInvalidCode(
	db: DatabaseOrTx,
	code: string,
	state: (typeof FIXTURE_INVALID_INVITATIONS)[keyof typeof FIXTURE_INVALID_INVITATIONS],
): Promise<void> {
	const codeDigest = await accessCodeDigest(code);
	const existing = await db
		.select({ id: accessCodes.id })
		.from(accessCodes)
		.where(eq(accessCodes.codeDigest, codeDigest))
		.limit(1);
	if (existing[0]) return;
	const day = 24 * 60 * 60 * 1000;
	await db.insert(accessCodes).values({
		codeDigest,
		expiresAt: state === "expired" ? new Date(Date.now() - day) : new Date(Date.now() + THIRTY_DAYS_MS),
		revokedAt: state === "revoked" ? new Date() : null,
		maxUses: 1,
		uses: state === "exhausted" ? 1 : 0,
	});
}

export async function seedFixtures(
	db: DatabaseOrTx,
	keys: FixtureKeys,
): Promise<{
	accounts: string[];
	assemblies_scenarios: typeof FIXTURE_SCENARIOS;
	invitation: string;
	valid_code: string;
	invalid_invitations: typeof FIXTURE_INVALID_INVITATIONS;
	provider_key: string;
	provider_model: string;
}> {
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
		const profile = fixtureProfile(name);
		await db
			.update(users)
			.set({
				displayName: await enc(`Sandbox ${name}`, keys.primaryKey),
				profile: await encJson(profile, keys.primaryKey),
				admittedAt: name === "fresh" ? null : new Date(),
				leaderVerified: name.startsWith("leader"),
				discoverable: name === "nearby-visible" || name === "nearby-contact",
				contactVisible: name === "nearby-contact",
				updatedAt: new Date(),
			})
			.where(eq(users.id, user.id));
		if (name === "nearby-contact") {
			await resolveAccount(db, {
				provider: "telegram",
				subject: "990000000001",
				linkingUserId: user.id,
				primaryKey: keys.primaryKey,
				deterministicKey: keys.deterministicKey,
			});
		}
	}
	await ensureOpenCode(db, FIXTURE_INVITATION);
	await ensureOpenCode(db, FIXTURE_VALID_CODE);
	await ensureInvalidCode(db, "7654321", "expired");
	await ensureInvalidCode(db, "7654322", "revoked");
	await ensureInvalidCode(db, "7654323", "exhausted");
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
	const local = await db
		.select({ id: assemblies.id })
		.from(assemblies)
		.where(eq(assemblies.sourceId, "sandbox:local"))
		.limit(1);
	const online = await db
		.select({ id: assemblies.id })
		.from(assemblies)
		.where(eq(assemblies.sourceId, "sandbox:online"))
		.limit(1);
	if (!local[0] || !online[0]) throw new Error("Missing sandbox assemblies");
	const membershipPlan = [
		["reader@example.test", local[0].id, "requested"],
		["member@example.test", local[0].id, "member"],
		["declined@example.test", local[0].id, "declined"],
		["left@example.test", local[0].id, "left"],
		["pending-online@example.test", online[0].id, "requested"],
	] as const;
	for (const [email, assemblyId, state] of membershipPlan) {
		const userId = await fixtureUserId(db, email, keys.deterministicKey);
		const mine = await db.execute(sql`
			SELECT id FROM memberships WHERE user_id = ${userId} AND assembly_id = ${assemblyId} LIMIT 1
		`);
		if (!mine[0]) {
			await db.insert(memberships).values({ userId, assemblyId, state });
		}
	}
	const leaderOneId = leaderOne[0]?.userId;
	const leaderTwoId = leaderTwo[0]?.userId;
	if (!leaderOneId || !leaderTwoId) throw new Error("Missing sandbox leaders");
	const endorsementPlan = [
		["applicant-pending@example.test", "requested", "requested"],
		["applicant-one@example.test", "accepted", "requested"],
		["applicant-declined@example.test", "declined", "requested"],
	] as const;
	for (const [email, first, second] of endorsementPlan) {
		const applicantId = await fixtureUserId(db, email, keys.deterministicKey);
		const pairs = [
			[leaderOneId, first],
			[leaderTwoId, second],
		] as const;
		for (const [leaderId, state] of pairs) {
			const existing = await db.execute(sql`
				SELECT id FROM endorsements WHERE applicant_id = ${applicantId} AND leader_id = ${leaderId} LIMIT 1
			`);
			if (!existing[0]) {
				await db.insert(endorsements).values({ applicantId, leaderId, state });
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
		assemblies_scenarios: FIXTURE_SCENARIOS,
		invitation: FIXTURE_INVITATION,
		valid_code: FIXTURE_VALID_CODE,
		invalid_invitations: FIXTURE_INVALID_INVITATIONS,
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
	const fixtureCodes = [FIXTURE_INVITATION, FIXTURE_VALID_CODE, ...Object.keys(FIXTURE_INVALID_INVITATIONS)];
	const codeDigests = await Promise.all(fixtureCodes.map((code) => accessCodeDigest(code)));
	await db.execute(
		sql`DELETE FROM access_codes WHERE code_digest IN (${sql.join(codeDigests.map((digest) => sql`${digest}`), sql`, `)})`,
	);
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
