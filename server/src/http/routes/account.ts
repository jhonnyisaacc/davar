import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { identities, memberships, notifications, users } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import { dec, decJson, enc, encJson } from "../../services/fields.js";
import {
	assertValidProfileUpdate,
	completedOnboarding,
	type Profile,
} from "../../services/profiles.js";
import { applySettings, SETTING_KEYS } from "../../services/settings.js";
import { redeemAdmission } from "../../services/admissions.js";
import { resolveCitySelection, searchCities } from "../../services/cities.js";
import { checkRateLimit } from "../../services/rateLimit.js";
import { sandboxEnabled } from "../../services/sandbox.js";
import { clientIp, inviteGateEnabled, requireAssemblyAccess, requireUser } from "../auth.js";
import { requireFlag } from "../../services/flags.js";
import { parseBody } from "../validation.js";
import type { AppVariables } from "../deps.js";
import type { DatabaseOrTx } from "../../db/client.js";
import { decryptionKeys, type ServerConfig } from "../../lib/config.js";

const updateSchema = z.object({
	display_name: z.string().max(100).optional().nullable(),
	discoverable: z.boolean().optional(),
	contact_visible: z.boolean().optional(),
	profile: z.record(z.unknown()).optional(),
});

const settingsSchema = z.object({
	settings: z.record(z.unknown()),
	version: z.number().int(),
});

const admissionSchema = z.object({
	code: z.string().optional().nullable(),
});

const notificationPreferencesSchema = z.object({
	enabled: z.boolean(),
});

const selectionSchema = z.object({
	selection: z.string(),
});

export async function accountShape(
	db: DatabaseOrTx,
	config: ServerConfig,
	userId: string,
	env: NodeJS.ProcessEnv = process.env,
) {
	const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	const row = rows[0];
	if (!row) throw new DomainError("not_found", 404);
	const providerRows = await db
		.select({ provider: identities.provider })
		.from(identities)
		.where(eq(identities.userId, userId));
	const profile = await decJson<Profile>(row.profile, decryptionKeys(config), {});
	const active = await db
		.select({ assemblyId: memberships.assemblyId })
		.from(memberships)
		.where(and(eq(memberships.userId, userId), eq(memberships.state, "member")))
		.limit(1);
	return {
		active_assembly_id: active[0]?.assemblyId ?? null,
		id: row.id,
		display_name: await dec(row.displayName, decryptionKeys(config)),
		profile,
		settings: (row.settings ?? {}) as Record<string, unknown>,
		settings_version: row.settingsVersion,
		consultations_remaining: Math.max(1 - row.freeConsultations, 0),
		discoverable: row.discoverable,
		contact_visible: row.contactVisible,
		admitted: !inviteGateEnabled(env) || row.admittedAt !== null,
		leader_verified: row.leaderVerified,
		onboarding_complete: completedOnboarding(profile),
		providers: providerRows.map((item) => item.provider),
	};
}

export const accountRoutes = new Hono<{ Variables: AppVariables }>();

accountRoutes.get("/account", async (c) => {
	const { db, config, env } = c.get("deps");
	const user = await requireUser(db, config, c);
	return c.json(await accountShape(db, config, user.id, env));
});

accountRoutes.patch("/account", async (c) => {
	const { db, config, env } = c.get("deps");
	const user = await requireUser(db, config, c);
	const body = parseBody(updateSchema, await c.req.json().catch(() => ({})));
	const data: {
		displayName?: string | null;
		discoverable?: boolean;
		contactVisible?: boolean;
		profile?: string;
	} = {};
	if (body.display_name !== undefined) {
		data.displayName = body.display_name
			? await enc(body.display_name, config.encryptionPrimaryKey)
			: null;
	}
	if (body.discoverable !== undefined) data.discoverable = body.discoverable;
	if (body.contact_visible !== undefined) data.contactVisible = body.contact_visible;
	if (body.profile !== undefined) {
		const update = body.profile as Record<string, unknown>;
		const next = assertValidProfileUpdate(user.profile, update, user.leaderVerified);
		data.profile = await encJson(next, config.encryptionPrimaryKey);
	}
	if (body.contact_visible === true && !user.providers.includes("telegram")) {
		throw new DomainError("telegram_contact_required");
	}
	if (Object.keys(data).length > 0) {
		await db
			.update(users)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(users.id, user.id));
	}
	return c.json(await accountShape(db, config, user.id, env));
});

accountRoutes.patch("/account/settings", async (c) => {
	const { db, config, env } = c.get("deps");
	const user = await requireUser(db, config, c);
	const body = parseBody(settingsSchema, await c.req.json().catch(() => ({})));
	// Rails permit() strips unknown keys before the service runs, so unknown
	// settings are ignored here rather than rejected.
	const allowed = Object.fromEntries(
		Object.entries(body.settings).filter(([key]) =>
			(SETTING_KEYS as readonly string[]).includes(key),
		),
	);
	const { settings, version } = applySettings(
		user.settings,
		allowed,
		body.version,
		user.settingsVersion,
	);
	await db
		.update(users)
		.set({ settings, settingsVersion: version, updatedAt: new Date() })
		.where(eq(users.id, user.id));
	return c.json(await accountShape(db, config, user.id, env));
});

accountRoutes.post("/account/admission", async (c) => {
	const { db, config, env, flags, http } = c.get("deps");
	const user = await requireUser(db, config, c);
	await requireFlag("assemblies", user.id, { env, http, flags });
	await checkRateLimit(db, `admission/${user.id}`, 10);
	const body = parseBody(admissionSchema, await c.req.json().catch(() => ({})));
	await redeemAdmission(db, user.id, body.code, inviteGateEnabled(env));
	return c.json(await accountShape(db, config, user.id, env));
});

accountRoutes.patch("/account/notification_preferences", async (c) => {
	const { db, config, env } = c.get("deps");
	const user = await requireUser(db, config, c);
	const body = parseBody(
		notificationPreferencesSchema,
		await c.req.json().catch(() => ({})),
	);
	if (body.enabled !== false) {
		throw new DomainError("notification_authorization_required");
	}
	await db
		.update(users)
		.set({
			settings: { ...user.settings, telegram_notifications: false },
			settingsVersion: user.settingsVersion + 1,
			updatedAt: new Date(),
		})
		.where(eq(users.id, user.id));
	return c.json(await accountShape(db, config, user.id, env));
});

accountRoutes.get("/account/notifications", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireUser(db, config, c);
	const rows = await db
		.select({
			id: notifications.id,
			kind: notifications.kind,
			data: notifications.data,
			readAt: notifications.readAt,
			createdAt: notifications.createdAt,
		})
		.from(notifications)
		.where(eq(notifications.userId, user.id))
		.orderBy(desc(notifications.createdAt))
		.limit(100);
	return c.json({
		notifications: rows.map((row) => ({
			id: row.id,
			kind: row.kind,
			data: row.data,
			read_at: row.readAt?.toISOString() ?? null,
			created_at: row.createdAt.toISOString(),
		})),
	});
});

accountRoutes.get("/cities", async (c) => {
	const { db, config, env } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, env, c.get("deps").flags);
	await checkRateLimit(db, `city/${user.id}`, 10);
	const query = c.req.query();
	if (typeof query.q !== "string") throw new DomainError("invalid_city_query");
	const cities = await searchCities(query.q, {
		secret: config.encryptionDeterministicKey,
		sandbox: sandboxEnabled(env, env.NODE_ENV ?? "development"),
		env,
	});
	return c.json({ cities });
});

accountRoutes.patch("/account/city", async (c) => {
	const { db, config, env } = c.get("deps");
	const user = await requireAssemblyAccess(db, config, c, env, c.get("deps").flags);
	const body = parseBody(selectionSchema, await c.req.json().catch(() => ({})));
	const city = await resolveCitySelection(body.selection, config.encryptionDeterministicKey);
	const profile = {
		...user.profile,
		city: city.city,
		latitude: city.latitude,
		longitude: city.longitude,
	};
	await db
		.update(users)
		.set({ profile: await encJson(profile, config.encryptionPrimaryKey), updatedAt: new Date() })
		.where(eq(users.id, user.id));
	return c.json({ city: city.city });
});
