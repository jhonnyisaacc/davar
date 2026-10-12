import { and, eq, isNull } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { randomToken, sha256Hex } from "../lib/crypto.js";

export interface SessionRow {
	id: string;
	userId: string;
	expiresAt: Date;
	revokedAt: Date | null;
}

export async function issueSession(
	db: DatabaseOrTx,
	userId: string,
): Promise<{ id: string; token: string }> {
	const token = randomToken(48);
	const tokenDigest = await sha256Hex(token);
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
	const rows = await db
		.insert(sessions)
		.values({ userId, tokenDigest, expiresAt })
		.returning({ id: sessions.id });
	const row = rows[0];
	if (!row) throw new Error("Session insert failed");
	return { id: row.id, token };
}

export async function authenticateSession(
	db: DatabaseOrTx,
	token: string | null | undefined,
): Promise<SessionRow | null> {
	if (!token) return null;
	const tokenDigest = await sha256Hex(token);
	const rows = await db
		.select()
		.from(sessions)
		.where(and(eq(sessions.tokenDigest, tokenDigest), isNull(sessions.revokedAt)))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	if (row.expiresAt.getTime() <= Date.now()) return null;
	return { id: row.id, userId: row.userId, expiresAt: row.expiresAt, revokedAt: row.revokedAt };
}
