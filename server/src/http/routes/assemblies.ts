import { Hono } from "hono";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { assemblies, identities, memberships, users } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import { dec, decJson, enc } from "../../services/fields.js";
import {
	completedOnboarding,
	doctrinalAgreement,
	ageOf,
	type Profile,
} from "../../services/profiles.js";
import { canCreateAssembly } from "../../services/policy.js";
import { decideMembership, requestMembership } from "../../services/memberships.js";
import { checkRateLimit } from "../../services/rateLimit.js";
import { requireAssemblyAccess } from "../auth.js";
import { parseBody, ValidationError } from "../validation.js";
import type { AppVariables } from "../deps.js";
import type { DatabaseOrTx } from "../../db/client.js";
import type { ServerConfig } from "../../lib/config.js";

const createSchema = z.object({
	name: z.string().min(1).max(120),
	kind: z.enum(["in_person", "online"]),
	city: z.string().optional().nullable(),
	latitude: z.number().optional().nullable(),
	longitude: z.number().optional().nullable(),
	meeting_url: z.string().optional().nullable(),
});

const updateSchema = z.object({
	name: z.string().min(1).max(120).optional(),
	meeting_url: z.string().nullable().optional(),
});

const decideSchema = z.object({
	decision: z.string(),
});

function roundCoordinate(value: number): number {
	return Math.round(value * 20) / 20;
}

function distanceKm(lat: number, lon: number, otherLat: number, otherLon: number): number {
	const rad = Math.PI / 180;
	const hav =
		Math.sin(((otherLat - lat) * rad) / 2) ** 2 +
		Math.cos(lat * rad) *
			Math.cos(otherLat * rad) *
			Math.sin(((otherLon - lon) * rad) / 2) ** 2;
	return 6371 * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(1 - hav, 0)));
}

export interface AssemblyRow {
	id: string;
	leaderId: string;
	name: string;
	kind: string;
	city: string | null;
	latitude: string | null;
	longitude: string | null;
	meetingUrl: string | null;
}

export async function assemblyShape(
	db: DatabaseOrTx,
	config: ServerConfig,
	assembly: AssemblyRow,
	userId: string,
	distance: number | null = null,
) {
	const memberRows = await db
		.select({ userId: memberships.userId, state: memberships.state })
		.from(memberships)
		.where(eq(memberships.assemblyId, assembly.id));
	const membership = memberRows.find((item) => item.userId === userId);
	const managed = assembly.leaderId === userId;
	const memberState =
		membership && (membership.state === "member" || membership.state === "requested")
			? membership.state
			: "not_member";
	return {
		id: assembly.id,
		name: assembly.name,
		kind: assembly.kind,
		city: assembly.city,
		member_state: memberState,
		can_manage: managed,
		distance_km: distance === null ? null : Math.round(distance * 10) / 10,
		meeting_url:
			managed || membership?.state === "member"
				? await dec(assembly.meetingUrl, config.encryptionPrimaryKey)
				: null,
	};
}

async function managedAssembly(
	db: DatabaseOrTx,
	assemblyId: string,
	userId: string,
): Promise<AssemblyRow> {
	const rows = await db
		.select()
		.from(assemblies)
		.where(and(eq(assemblies.id, assemblyId), eq(assemblies.leaderId, userId)))
		.limit(1);
	const assembly = rows[0];
	if (!assembly) throw new DomainError("not_found", 404);
	return assembly;
}

async function telegramContact(
	db: DatabaseOrTx,
	config: ServerConfig,
	userId: string,
): Promise<string | null> {
	const rows = await db
		.select({ subject: identities.subject })
		.from(identities)
		.where(and(eq(identities.userId, userId), eq(identities.provider, "telegram")))
		.limit(1);
	const subject = rows[0] ? await dec(rows[0].subject, config.encryptionPrimaryKey) : null;
	return subject ? `tg://user?id=${subject}` : null;
}

export const assemblyRoutes = new Hono<{ Variables: AppVariables }>();

assemblyRoutes.get("/assemblies/leaders", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	const query = (c.req.query().q ?? "").toLowerCase();
	if (query.length > 100) throw new DomainError("invalid_leader_query");
	const rows = await db
		.select()
		.from(users)
		.where(and(eq(users.leaderVerified, true), ne(users.id, user.id)))
		.limit(100);
	const leaders: Array<{ id: string; name: string | null; city: unknown }> = [];
	for (const row of rows) {
		const name = await dec(row.displayName, config.encryptionPrimaryKey);
		if (query && !(name ?? "").toLowerCase().includes(query)) continue;
		const profile = await decJson<Profile>(row.profile, config.encryptionPrimaryKey, {});
		leaders.push({ id: row.id, name, city: profile.city ?? null });
	}
	return c.json({ leaders });
});

assemblyRoutes.get("/assemblies", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	const params = c.req.query();
	const kind = params.kind ?? "in_person";
	if (kind !== "in_person" && kind !== "online") throw new DomainError("invalid_kind");
	if (kind === "online") {
		const rows = await db.select().from(assemblies).where(eq(assemblies.kind, "online")).limit(100);
		return c.json({
			assemblies: await Promise.all(
				rows.map((assembly) => assemblyShape(db, config, assembly, user.id, null)),
			),
			people: [],
		});
	}
	const lat = Number(params.latitude);
	const lon = Number(params.longitude);
	const radius = params.radius_km === undefined ? 25 : Number(params.radius_km);
	if (
		!Number.isFinite(lat) ||
		!Number.isFinite(lon) ||
		lat < -90 ||
		lat > 90 ||
		lon < -180 ||
		lon > 180 ||
		![10, 25, 50, 100].includes(radius)
	) {
		throw new DomainError("invalid_area");
	}
	const rows = await db.execute(sql`
		SELECT * FROM assemblies WHERE kind = 'in_person'
		AND latitude BETWEEN ${lat - radius / 111.0} AND ${lat + radius / 111.0}
		LIMIT 1000
	`);
	const nearby = (rows as unknown as AssemblyRow[])
		.filter((assembly) => assembly.latitude !== null && assembly.longitude !== null)
		.map((assembly) => ({
			assembly,
			distance: distanceKm(lat, lon, Number(assembly.latitude), Number(assembly.longitude)),
		}))
		.filter((item) => item.distance <= radius)
		.sort((a, b) => a.distance - b.distance)
		.slice(0, 100);
	let people: unknown[] = [];
	if (nearby.length === 0) {
		const candidates = await db
			.select()
			.from(users)
			.where(and(eq(users.discoverable, true), ne(users.id, user.id)))
			.limit(500);
		for (const candidate of candidates) {
			const profile = await decJson<Profile>(candidate.profile, config.encryptionPrimaryKey, {});
			if (
				!completedOnboarding(profile) ||
				!doctrinalAgreement(profile) ||
				typeof profile.latitude !== "number" ||
				typeof profile.longitude !== "number"
			) {
				continue;
			}
			if (distanceKm(lat, lon, profile.latitude, profile.longitude) > radius) continue;
			people.push({
				id: candidate.id,
				name: await dec(candidate.displayName, config.encryptionPrimaryKey),
				area: profile.city ?? null,
				contact_url: candidate.contactVisible
					? await telegramContact(db, config, candidate.id)
					: null,
			});
		}
	}
	return c.json({
		assemblies: await Promise.all(
			nearby.map((item) => assemblyShape(db, config, item.assembly, user.id, item.distance)),
		),
		people,
	});
});

assemblyRoutes.post("/assemblies", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	const body = parseBody(createSchema, await c.req.json().catch(() => ({})));
	if (!canCreateAssembly({ leaderVerified: user.leaderVerified, profile: user.profile })) {
		throw new DomainError("leader_verification_required", 403);
	}
	if (body.meeting_url !== undefined && body.meeting_url !== null && body.meeting_url !== "") {
		if (!body.meeting_url.startsWith("https://")) {
			throw new ValidationError({ meeting_url: ["is invalid"] });
		}
	}
	const attributes: {
		name: string;
		kind: string;
		city: string | null;
		latitude: string | null;
		longitude: string | null;
		meetingUrl: string | null;
	} = {
		name: body.name,
		kind: body.kind,
		city: body.city ?? null,
		latitude: body.latitude !== undefined && body.latitude !== null ? String(roundCoordinate(body.latitude)) : null,
		longitude: body.longitude !== undefined && body.longitude !== null ? String(roundCoordinate(body.longitude)) : null,
		meetingUrl: body.meeting_url
			? await enc(body.meeting_url, config.encryptionPrimaryKey)
			: null,
	};
	if (attributes.kind === "in_person") {
		if (typeof user.profile.latitude !== "number" || typeof user.profile.longitude !== "number") {
			throw new DomainError("city_selection_required");
		}
		attributes.city = (user.profile.city as string) ?? null;
		attributes.latitude = String(roundCoordinate(user.profile.latitude));
		attributes.longitude = String(roundCoordinate(user.profile.longitude));
	}
	const created = await db.transaction(async (tx) => {
		const existing = await tx
			.select({ id: memberships.id })
			.from(memberships)
			.where(and(eq(memberships.userId, user.id), eq(memberships.state, "member")))
			.limit(1);
		if (existing[0]) throw new DomainError("already_member_elsewhere", 409);
		const inserted = await tx
			.insert(assemblies)
			.values({ leaderId: user.id, ...attributes })
			.returning();
		const assembly = inserted[0];
		if (!assembly) throw new Error("Assembly insert failed");
		try {
			await tx.insert(memberships).values({ userId: user.id, assemblyId: assembly.id, state: "member" });
		} catch (error) {
			const { isUniqueViolation } = await import("../../services/accounts.js");
			if (isUniqueViolation(error)) throw new DomainError("already_member_elsewhere", 409);
			throw error;
		}
		return assembly;
	});
	return c.json(await assemblyShape(db, config, created, user.id, null), 201);
});

assemblyRoutes.get("/assemblies/:id", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	const rows = await db
		.select()
		.from(assemblies)
		.where(eq(assemblies.id, c.req.param("id")))
		.limit(1);
	const assembly = rows[0];
	if (!assembly) throw new DomainError("not_found", 404);
	return c.json(await assemblyShape(db, config, assembly, user.id, null));
});

assemblyRoutes.patch("/assemblies/:id", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	const assembly = await managedAssembly(db, c.req.param("id"), user.id);
	const body = parseBody(updateSchema, await c.req.json().catch(() => ({})));
	const update: { name?: string; meetingUrl?: string | null } = {};
	if (body.name !== undefined) update.name = body.name;
	if (body.meeting_url !== undefined) {
		if (body.meeting_url && !body.meeting_url.startsWith("https://")) {
			throw new ValidationError({ meeting_url: ["is invalid"] });
		}
		update.meetingUrl = body.meeting_url
			? await enc(body.meeting_url, config.encryptionPrimaryKey)
			: null;
	}
	if (Object.keys(update).length > 0) {
		await db.update(assemblies).set(update).where(eq(assemblies.id, assembly.id));
	}
	const rows = await db.select().from(assemblies).where(eq(assemblies.id, assembly.id)).limit(1);
	const fresh = rows[0];
	if (!fresh) throw new DomainError("not_found", 404);
	return c.json(await assemblyShape(db, config, fresh, user.id, null));
});

assemblyRoutes.post("/assemblies/:id/join", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	await checkRateLimit(db, `join/${user.id}`, 20);
	const target = await db
		.select({ id: assemblies.id })
		.from(assemblies)
		.where(eq(assemblies.id, c.req.param("id")))
		.limit(1);
	if (!target[0]) throw new DomainError("not_found", 404);
	return c.json(
		await requestMembership(db, {
			userId: user.id,
			assemblyId: target[0].id,
			primaryKey: config.encryptionPrimaryKey,
		}),
	);
});

assemblyRoutes.delete("/assemblies/:id/leave", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	const rows = await db
		.select()
		.from(assemblies)
		.where(eq(assemblies.id, c.req.param("id")))
		.limit(1);
	const assembly = rows[0];
	if (!assembly) throw new DomainError("not_found", 404);
	if (assembly.leaderId === user.id) throw new DomainError("leader_cannot_leave", 409);
	const mine = await db
		.select()
		.from(memberships)
		.where(and(eq(memberships.userId, user.id), eq(memberships.assemblyId, assembly.id)))
		.limit(1);
	if (!mine[0]) throw new DomainError("not_found", 404);
	await db
		.update(memberships)
		.set({ state: "left", updatedAt: new Date() })
		.where(eq(memberships.id, mine[0].id));
	return c.body(null, 204);
});

assemblyRoutes.get("/assemblies/:id/members", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	const assembly = await managedAssembly(db, c.req.param("id"), user.id);
	const rows = await db
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.assemblyId, assembly.id),
				inArray(memberships.state, ["member", "requested"]),
			),
		);
	const result = [];
	for (const membership of rows) {
		const owner = await db.select().from(users).where(eq(users.id, membership.userId)).limit(1);
		const member = owner[0];
		if (!member) continue;
		const profile = await decJson<Profile>(member.profile, config.encryptionPrimaryKey, {});
		result.push({
			id: membership.id,
			state: membership.state,
			user: {
				id: member.id,
				name: await dec(member.displayName, config.encryptionPrimaryKey),
				gender: membership.state === "requested" ? (profile.gender ?? null) : null,
				age: ageOf(profile),
				contact_url: await telegramContact(db, config, member.id),
			},
		});
	}
	return c.json({ memberships: result });
});

assemblyRoutes.post("/assemblies/:id/memberships/:membership_id/decision", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, c.get("deps").env, c.get("deps").flags);
	if (!completedOnboarding(user.profile)) {
		throw new DomainError("onboarding_required", 403);
	}
	const assembly = await managedAssembly(db, c.req.param("id"), user.id);
	const found = await db
		.select({ id: memberships.id })
		.from(memberships)
		.where(
			and(
				eq(memberships.id, c.req.param("membership_id")),
				eq(memberships.assemblyId, assembly.id),
			),
		)
		.limit(1);
	if (!found[0]) throw new DomainError("not_found", 404);
	const body = parseBody(decideSchema, await c.req.json().catch(() => ({})));
	return c.json(
		await decideMembership(db, {
			actorId: user.id,
			membershipId: found[0].id,
			decision: body.decision,
		}),
	);
});

