import { and, eq, ne, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { assemblies, memberships, notifications, users } from "../db/schema.js";
import { DomainError } from "../lib/errors.js";
import { completedOnboarding, parseProfile, type Profile } from "./profiles.js";
import { canJoinAssembly, canManageAssembly } from "./policy.js";


async function userProfile(
	db: DatabaseOrTx,
	userId: string,
	primaryKey: string,
): Promise<Profile> {
	const rows = await db.select({ profile: users.profile }).from(users).where(eq(users.id, userId)).limit(1);
	const row = rows[0];
	if (!row) throw new DomainError("not_found", 404);
	return parseProfile(row.profile, primaryKey);
}

export async function requestMembership(
	db: DatabaseOrTx,
	input: { userId: string; assemblyId: string; primaryKey: string },
): Promise<{ id: string; state: string }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`);
		const profile = await userProfile(tx, input.userId, input.primaryKey);
		if (!completedOnboarding(profile)) {
			throw new DomainError("onboarding_required", 403);
		}
		if (!canJoinAssembly(profile)) {
			throw new DomainError("starting_cannot_join", 403);
		}
		const assembly = await tx
			.select()
			.from(assemblies)
			.where(eq(assemblies.id, input.assemblyId))
			.limit(1);
		const target = assembly[0];
		if (!target) throw new DomainError("not_found", 404);
		const elsewhere = await tx
			.select({ id: memberships.id })
			.from(memberships)
			.where(
				and(
					eq(memberships.userId, input.userId),
					eq(memberships.state, "member"),
					ne(memberships.assemblyId, input.assemblyId),
				),
			)
			.limit(1);
		if (elsewhere[0]) throw new DomainError("already_member_elsewhere", 409);
		const existing = await tx
			.select()
			.from(memberships)
			.where(
				and(eq(memberships.userId, input.userId), eq(memberships.assemblyId, input.assemblyId)),
			)
			.limit(1);
		const current = existing[0];
		if (current && (current.state === "requested" || current.state === "member")) {
			return { id: current.id, state: current.state };
		}
		let membershipId: string;
		if (current) {
			await tx
				.update(memberships)
				.set({ state: "requested", updatedAt: new Date() })
				.where(eq(memberships.id, current.id));
			membershipId = current.id;
		} else {
			const created = await tx
				.insert(memberships)
				.values({ userId: input.userId, assemblyId: input.assemblyId, state: "requested" })
				.returning({ id: memberships.id });
			const row = created[0];
			if (!row) throw new Error("Membership insert failed");
			membershipId = row.id;
		}
		const now = new Date();
		await tx.insert(notifications).values([
			{ userId: target.leaderId, kind: "join_requested", data: { assembly_id: input.assemblyId, membership_id: membershipId }, createdAt: now, updatedAt: now },
			{ userId: input.userId, kind: "join_requested", data: { assembly_id: input.assemblyId }, createdAt: now, updatedAt: now },
		]);
		return { id: membershipId, state: "requested" };
	});
}

export async function decideMembership(
	db: DatabaseOrTx,
	input: { actorId: string; membershipId: string; decision: string },
): Promise<{ id: string; state: string }> {
	if (input.decision !== "accepted" && input.decision !== "declined") {
		throw new DomainError("invalid_decision");
	}
	return db.transaction(async (tx) => {
		const found = await tx
			.select()
			.from(memberships)
			.where(eq(memberships.id, input.membershipId))
			.limit(1);
		const membership = found[0];
		if (!membership) throw new DomainError("not_found", 404);
		const assembly = await tx
			.select()
			.from(assemblies)
			.where(eq(assemblies.id, membership.assemblyId))
			.limit(1);
		const target = assembly[0];
		if (!target || !canManageAssembly(input.actorId, target.leaderId)) {
			throw new DomainError("forbidden", 403);
		}
		await tx.execute(sql`SELECT id FROM users WHERE id = ${membership.userId} FOR UPDATE`);
		await tx.execute(sql`SELECT id FROM memberships WHERE id = ${membership.id} FOR UPDATE`);
		const fresh = await tx
			.select()
			.from(memberships)
			.where(eq(memberships.id, membership.id))
			.limit(1);
		const current = fresh[0];
		if (!current || current.state !== "requested") {
			throw new DomainError("request_not_pending", 409);
		}
		if (input.decision === "accepted") {
			const elsewhere = await tx
				.select({ id: memberships.id })
				.from(memberships)
				.where(
					and(
						eq(memberships.userId, membership.userId),
						eq(memberships.state, "member"),
						ne(memberships.id, membership.id),
					),
				)
				.limit(1);
			if (elsewhere[0]) throw new DomainError("already_member_elsewhere", 409);
		}
		const state = input.decision === "accepted" ? "member" : "declined";
		await tx
			.update(memberships)
			.set({ state, updatedAt: new Date() })
			.where(eq(memberships.id, membership.id));
		const now = new Date();
		await tx.insert(notifications).values([
			{ userId: membership.userId, kind: `join_${input.decision}`, data: { assembly_id: membership.assemblyId }, createdAt: now, updatedAt: now },
			{ userId: input.actorId, kind: `join_${input.decision}`, data: { assembly_id: membership.assemblyId }, createdAt: now, updatedAt: now },
		]);
		return { id: membership.id, state };
	});
}
