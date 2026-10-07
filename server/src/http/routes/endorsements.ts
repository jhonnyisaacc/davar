import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { endorsements, notifications, users } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import { dec, decJson } from "../../services/fields.js";
import { completedOnboarding } from "../../services/profiles.js";
import { requireAssemblyAccess } from "../auth.js";
import { parseBody } from "../validation.js";
import type { AppVariables } from "../deps.js";

const createSchema = z.object({
	leader_id: z.string(),
});

const updateSchema = z.object({
	state: z.string(),
});

export const endorsementRoutes = new Hono<{ Variables: AppVariables }>();

endorsementRoutes.get("/endorsements", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c);
	const rows = await db.execute(sql`
		SELECT e.id, e.state, e.applicant_id AS "applicantId", e.leader_id AS "leaderId"
		FROM endorsements e WHERE e.applicant_id = ${user.id} OR e.leader_id = ${user.id}
		LIMIT 100
	`);
	const result = [];
	for (const item of rows as unknown as Array<{ id: string; state: string; applicantId: string; leaderId: string }>) {
		const applicant = await db.select().from(users).where(eq(users.id, item.applicantId)).limit(1);
		const leader = await db.select().from(users).where(eq(users.id, item.leaderId)).limit(1);
		if (!applicant[0] || !leader[0]) continue;
		result.push({
			id: item.id,
			state: item.state,
			applicant_name: await dec(applicant[0].displayName, config.encryptionPrimaryKey),
			leader_name: await dec(leader[0].displayName, config.encryptionPrimaryKey),
			can_decide: item.leaderId === user.id && item.state === "requested",
		});
	}
	return c.json({ endorsements: result });
});

endorsementRoutes.post("/endorsements", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c);
	if (
		!completedOnboarding(user.profile) ||
		user.profile.experience !== "leader" ||
		user.profile.gender !== "male"
	) {
		throw new DomainError("onboarding_required", 403);
	}
	const body = parseBody(createSchema, await c.req.json().catch(() => ({})));
	const leader = await db.select().from(users).where(eq(users.id, body.leader_id)).limit(1);
	const endorser = leader[0];
	if (!endorser) throw new DomainError("not_found", 404);
	if (!endorser.leaderVerified || endorser.id === user.id) {
		throw new DomainError("invalid_endorser");
	}
	const created = await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
		const declined = await tx
			.select({ id: endorsements.id })
			.from(endorsements)
			.where(and(eq(endorsements.applicantId, user.id), eq(endorsements.state, "declined")))
			.limit(1);
		if (declined[0]) throw new DomainError("contact_support", 409);
		const count = await tx.execute(sql`
			SELECT count(*)::int AS "count" FROM endorsements WHERE applicant_id = ${user.id}
		`);
		if ((count[0] as { count: number }).count >= 2) {
			throw new DomainError("two_endorsers_maximum", 409);
		}
		const inserted = await tx
			.insert(endorsements)
			.values({ applicantId: user.id, leaderId: endorser.id })
			.returning({ id: endorsements.id, state: endorsements.state });
		const endorsement = inserted[0];
		if (!endorsement) throw new Error("Endorsement insert failed");
		const now = new Date();
		await tx.insert(notifications).values({
			userId: endorser.id,
			kind: "endorsement_requested",
			data: { endorsement_id: endorsement.id },
			createdAt: now,
			updatedAt: now,
		});
		return endorsement;
	});
	return c.json({ id: created.id, state: created.state }, 201);
});

endorsementRoutes.patch("/endorsements/:id", async (c) => {
	const { db } = c.get("deps");
	const user = await requireAssemblyAccess(db, c.get("deps").config, c);
	const body = parseBody(updateSchema, await c.req.json().catch(() => ({})));
	if (body.state !== "accepted" && body.state !== "declined") {
		throw new DomainError("invalid_decision");
	}
	const updated = await db.transaction(async (tx) => {
		const found = await tx
			.select()
			.from(endorsements)
			.where(and(eq(endorsements.id, c.req.param("id")), eq(endorsements.leaderId, user.id)))
			.limit(1);
		const endorsement = found[0];
		if (!endorsement) throw new DomainError("not_found", 404);
		await tx.execute(sql`SELECT id, profile FROM users WHERE id = ${endorsement.applicantId} FOR UPDATE`);
		await tx.execute(sql`SELECT id FROM endorsements WHERE id = ${endorsement.id} FOR UPDATE`);
		const fresh = await tx
			.select()
			.from(endorsements)
			.where(eq(endorsements.id, endorsement.id))
			.limit(1);
		const current = fresh[0];
		if (!current || current.state !== "requested") {
			throw new DomainError("request_not_pending", 409);
		}
		await tx
			.update(endorsements)
			.set({ state: body.state, updatedAt: new Date() })
			.where(eq(endorsements.id, endorsement.id));
		const accepted = await tx.execute(sql`
			SELECT count(*)::int AS "count" FROM endorsements
			WHERE applicant_id = ${endorsement.applicantId} AND state = 'accepted'
		`);
		const applicant = await tx
			.select()
			.from(users)
			.where(eq(users.id, endorsement.applicantId))
			.limit(1);
		const profile = applicant[0]?.profile;
		if ((accepted[0] as { count: number }).count === 2 && profile) {
			const parsed = await decJson<{ gender?: string }>(
				profile,
				c.get("deps").config.encryptionPrimaryKey,
				{},
			);
			if (parsed.gender === "male") {
				await tx
					.update(users)
					.set({ leaderVerified: true, updatedAt: new Date() })
					.where(eq(users.id, endorsement.applicantId));
			}
		}
		const now = new Date();
		await tx.insert(notifications).values({
			userId: endorsement.applicantId,
			kind: `endorsement_${body.state}`,
			data: { endorsement_id: endorsement.id },
			createdAt: now,
			updatedAt: now,
		});
		return { id: endorsement.id, state: body.state };
	});
	return c.json(updated);
});
