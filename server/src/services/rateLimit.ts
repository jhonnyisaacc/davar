import { eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { rateLimits } from "../db/schema.js";
import { DomainError } from "../lib/errors.js";

export async function checkRateLimit(
	db: DatabaseOrTx,
	bucket: string,
	limit: number,
	period = 60,
): Promise<void> {
	const slot = Math.floor(Date.now() / 1000 / period);
	const key = `${bucket}/${slot}`;
	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
		const existing = await tx
			.select()
			.from(rateLimits)
			.where(eq(rateLimits.bucket, key))
			.limit(1);
		const row = existing[0];
		if (!row) {
			await tx.insert(rateLimits).values({
				bucket: key,
				attempts: 1,
				expiresAt: new Date((slot + 1) * period * 1000 + 60 * 1000),
			});
		} else {
			if (row.attempts >= limit) throw new DomainError("rate_limited", 429);
			await tx
				.update(rateLimits)
				.set({ attempts: row.attempts + 1 })
				.where(eq(rateLimits.bucket, key));
		}
		await tx.execute(sql`DELETE FROM rate_limits WHERE expires_at < now()`);
	});
}

export async function rateLimitAvailable(
	db: DatabaseOrTx,
	bucket: string,
	limit: number,
	period = 60,
): Promise<boolean> {
	const slot = Math.floor(Date.now() / 1000 / period);
	const rows = await db
		.select({ attempts: rateLimits.attempts })
		.from(rateLimits)
		.where(eq(rateLimits.bucket, `${bucket}/${slot}`))
		.limit(1);
	const row = rows[0];
	return !row || row.attempts < limit;
}
