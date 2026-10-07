import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { identities, users } from "../db/schema.js";
import { decryptionKeys, type ServerConfig } from "../lib/config.js";
import { DomainError } from "../lib/errors.js";
import { dec, decJson } from "../services/fields.js";
import { authenticateSession } from "../services/sessions.js";
import { resolveClientIp, socketAddress } from "../services/remoteIp.js";
import { evaluateFlags, type FlagSet } from "../services/flags.js";
import type { Profile } from "../services/profiles.js";
import { parseProfile } from "../services/profiles.js";
import type { AppDeps } from "./deps.js";

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
	const deps = c.get("deps") as AppDeps | undefined;
	return resolveClientIp({
		remoteAddr: deps?.remoteAddr ?? socketAddress(c),
		forwardedFor: c.req.header("x-forwarded-for") ?? null,
		trusted: deps?.config.trustedProxies ?? [],
	});
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
		displayName: await dec(row.displayName, decryptionKeys(config)),
		profile: await decJson<Profile>(row.profile, decryptionKeys(config), {}),
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
	flags?: FlagSet | null,
): Promise<CurrentUser> {
	const user = await requireUser(db, config, c);
	const resolved = flags ?? (await evaluateFlags(user.id, { env }));
	if (!resolved.assemblies) {
		throw new DomainError("feature_unavailable", 503);
	}
	if (user.providers.length === 0) {
		throw new DomainError("registered_account_required", 403);
	}
	if (inviteGateEnabled(env) && !user.admittedAt) {
		throw new DomainError("admission_required", 403);
	}
	return user;
}

export { parseProfile };
