import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { identities, users } from "../db/schema.js";
import type { ServerConfig } from "../lib/config.js";
import { DomainError } from "../lib/errors.js";
import { dec, decJson } from "../services/fields.js";
import { authenticateSession } from "../services/sessions.js";
import { checkRateLimit } from "../services/rateLimit.js";
import type { Profile } from "../services/profiles.js";
import { parseProfile } from "../services/profiles.js";

export interface CurrentUser {
	id: string;
	displayName: string | null;
	profile: Profile;
	settings: Record<string, unknown>;
	settingsVersion: number;
	discoverable: boolean;
	contactVisible: boolean;
	leaderVerified: boolean;
	admittedAt: Date | null;
	freeConsultations: number;
	providers: string[];
}

export function bearerToken(c: Context): string | null {
	const header = c.req.header("Authorization") ?? c.req.header("authorization");
	if (!header) return null;
	const prefix = "Bearer ";
	if (!header.startsWith(prefix)) return null;
	return header.slice(prefix.length) || null;
}

export function clientIp(c: Context): string {
	const forwarded = c.req.header("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
	return "local";
}

export async function currentUser(
	db: DatabaseOrTx,
	config: ServerConfig,
	c: Context,
): Promise<CurrentUser | null> {
	const session = await authenticateSession(db, bearerToken(c));
	if (!session) return null;
	const rows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
	const row = rows[0];
	if (!row) return null;
	const providerRows = await db
		.select({ provider: identities.provider })
		.from(identities)
		.where(eq(identities.userId, row.id));
	return {
		id: row.id,
		displayName: await dec(row.displayName, config.encryptionPrimaryKey),
		profile: await decJson<Profile>(row.profile, config.encryptionPrimaryKey, {}),
		settings: (row.settings ?? {}) as Record<string, unknown>,
		settingsVersion: row.settingsVersion,
		discoverable: row.discoverable,
		contactVisible: row.contactVisible,
		leaderVerified: row.leaderVerified,
		admittedAt: row.admittedAt,
		freeConsultations: row.freeConsultations,
		providers: providerRows.map((item) => item.provider),
	};
}

export async function requireUser(
	db: DatabaseOrTx,
	config: ServerConfig,
	c: Context,
): Promise<CurrentUser> {
	const user = await currentUser(db, config, c);
	if (!user) throw new DomainError("authentication_required", 401);
	return user;
}

export function inviteGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return (env.INVITE_GATE_ENABLED ?? "true") !== "false";
}

export async function requireAssemblyAccess(
	db: DatabaseOrTx,
	config: ServerConfig,
	c: Context,
	env: NodeJS.ProcessEnv = process.env,
): Promise<CurrentUser> {
	const user = await requireUser(db, config, c);
	if (user.providers.length === 0) {
		throw new DomainError("registered_account_required", 403);
	}
	if (inviteGateEnabled(env) && !user.admittedAt) {
		throw new DomainError("admission_required", 403);
	}
	return user;
}

export async function throttle(
	db: DatabaseOrTx,
	c: Context,
	bucket: string,
	limit = 20,
): Promise<void> {
	await checkRateLimit(db, bucket, limit);
}

export { parseProfile };
