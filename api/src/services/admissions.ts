import { eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { accessCodes } from "../db/schema.js";
import { sha256Hex } from "../lib/crypto.js";
import { DomainError } from "../lib/errors.js";
import { asDateRequired } from "./fields.js";

export async function accessCodeDigest(value: unknown): Promise<string> {
	const normalized = String(value ?? "")
		.replace(/-/g, "")
		.trim()
		.toUpperCase();
	return sha256Hex(normalized);
}

export async function redeemAdmission(
	db: DatabaseOrTx,
	userId: string,
	value: unknown,
	inviteGateEnabled: boolean,
): Promise<void> {
	if (!inviteGateEnabled) return;
	await db.transaction(async (tx) => {
		const locked = await tx.execute(
			sql`SELECT admitted_at AS "admittedAt" FROM users WHERE id = ${userId} FOR UPDATE`,
		);
		const row = locked[0] as { admittedAt: Date | null } | undefined;
		if (!row) throw new DomainError("not_found", 404);
		if (row.admittedAt) return;
		const digest = await accessCodeDigest(value);
		const codes = await tx.execute(
			sql`SELECT id, revoked_at AS "revokedAt", expires_at AS "expiresAt", uses, max_uses AS "maxUses" FROM access_codes WHERE code_digest = ${digest} FOR UPDATE`,
		);
		const code = codes[0] as
			| { id: string; revokedAt: Date | string | null; expiresAt: Date | string; uses: number; maxUses: number }
			| undefined;
		if (
			!code ||
			code.revokedAt ||
			asDateRequired(code.expiresAt).getTime() <= Date.now() ||
			code.uses >= code.maxUses
		) {
			throw new DomainError("invalid_code", 403);
		}
		await tx
			.update(accessCodes)
			.set({ uses: code.uses + 1, updatedAt: new Date() })
			.where(eq(accessCodes.id, code.id));
		await tx.execute(
			sql`UPDATE users SET admitted_at = now(), updated_at = now() WHERE id = ${userId}`,
		);
	});
}
