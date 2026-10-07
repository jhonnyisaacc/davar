import { eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { rateLimits } from "../db/schema.js";
import { DomainError } from "../lib/errors.js";

export async function checkRateLimit(
	db: DatabaseOrTx,
	bucket: string,
	limit: number,
): Promise<void> {
	const key = `${bucket}/${Math.floor(Date.now() / 60000)}`;
	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
		const existing = await tx
			.select()
			.from(rateLimits)
			.where(eq(rateLimits.bucket, key))
			.limit(1);
		const row = existing[0];
		const now = new Date();
		if (!row) {
			await tx.insert(rateLimits).values({
				bucket: key,
				attempts: 1,
				expiresAt: new Date(now.getTime() + 2 * 60 * 1000),
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
