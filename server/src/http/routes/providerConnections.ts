import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { providerConnections } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import { enc } from "../../services/fields.js";
import { productCapabilities } from "../../services/capabilities.js";
import { requireFlag } from "../../services/flags.js";
import { availableProviders } from "../../services/provider.js";
import { requireUser } from "../auth.js";
import { parseBody } from "../validation.js";
import type { AppVariables } from "../deps.js";

const createSchema = z.object({
	provider: z.string(),
	model: z.unknown(),
	credential: z.unknown(),
});

const MODEL_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;

export const providerConnectionRoutes = new Hono<{ Variables: AppVariables }>();

providerConnectionRoutes.get("/provider_connections", async (c) => {
	const { db, config, env, flags, http } = c.get("deps");
	const user = await requireUser(db, config, c);
	const capabilities = await productCapabilities(db, {
		userId: user.id,
		env,
		nodeEnv: env.NODE_ENV ?? "development",
		flags,
		http,
	});
	const rows = await db
		.select({
			id: providerConnections.id,
			provider: providerConnections.provider,
			model: providerConnections.model,
		})
		.from(providerConnections)
		.where(eq(providerConnections.userId, user.id));
	return c.json({
		connections: rows,
		supported: capabilities.ai.providers,
		unavailable: ["muse"],
	});
});

providerConnectionRoutes.post("/provider_connections", async (c) => {
	const { db, config, env, flags, http } = c.get("deps");
	const user = await requireUser(db, config, c);
	await requireFlag("ai_provider_connections", user.id, { env, http, flags });
	if (user.providers.length === 0) {
		throw new DomainError("registered_account_required", 403);
	}
	const body = parseBody(createSchema, await c.req.json().catch(() => ({})));
	if (typeof body.provider !== "string" || !availableProviders(env).includes(body.provider)) {
		throw new DomainError("provider_not_supported", 503);
	}
	if (typeof body.model !== "string" || !MODEL_PATTERN.test(body.model)) {
		throw new DomainError("invalid_model");
	}
	if (
		typeof body.credential !== "string" ||
		body.credential.length < 8 ||
		body.credential.length > 1000
	) {
		throw new DomainError("invalid_credential");
	}
	const found = await db
		.select({ id: providerConnections.id })
		.from(providerConnections)
		.where(
			and(
				eq(providerConnections.userId, user.id),
				eq(providerConnections.provider, body.provider),
			),
		)
		.limit(1);
	const values = {
		credential: await enc(body.credential, config.encryptionPrimaryKey),
		model: body.model,
		updatedAt: new Date(),
	};
	let id: string;
	if (found[0]) {
		await db.update(providerConnections).set(values).where(eq(providerConnections.id, found[0].id));
		id = found[0].id;
	} else {
		const created = await db
			.insert(providerConnections)
			.values({ userId: user.id, provider: body.provider, ...values })
			.returning({ id: providerConnections.id });
		const row = created[0];
		if (!row) throw new Error("Connection insert failed");
		id = row.id;
	}
	const fresh = await db
		.select({
			id: providerConnections.id,
			provider: providerConnections.provider,
			model: providerConnections.model,
		})
		.from(providerConnections)
		.where(eq(providerConnections.id, id))
		.limit(1);
	const connection = fresh[0];
	if (!connection) throw new DomainError("not_found", 404);
	return c.json(connection);
});

providerConnectionRoutes.delete("/provider_connections/:id", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireUser(db, config, c);
	const found = await db
		.select({ id: providerConnections.id })
		.from(providerConnections)
		.where(
			and(
				eq(providerConnections.id, c.req.param("id")),
				eq(providerConnections.userId, user.id),
			),
		)
		.limit(1);
	if (!found[0]) throw new DomainError("not_found", 404);
	await db.delete(providerConnections).where(eq(providerConnections.id, found[0].id));
	return c.body(null, 204);
});
