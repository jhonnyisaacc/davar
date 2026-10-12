import { and, eq, lt, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { messages } from "../db/schema.js";
import { enc } from "./fields.js";

export async function recoverConsultations(
	db: DatabaseOrTx,
	primaryKey: string,
	olderThanMinutes = 10,
): Promise<{ recovered: number }> {
	const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
	const stale = await db
		.select({ id: messages.id, conversationId: messages.conversationId })
		.from(messages)
		.where(
			and(
				eq(messages.role, "assistant"),
				eq(messages.state, "pending"),
				lt(messages.createdAt, cutoff),
			),
		);
	let recovered = 0;
	for (const message of stale) {
		await db.transaction(async (tx) => {
			const owner = await tx.execute(sql`
				SELECT users.id, users.free_consultations AS "freeConsultations"
				FROM users JOIN conversations ON conversations.user_id = users.id
				WHERE conversations.id = ${message.conversationId} FOR UPDATE OF users
			`);
			const user = owner[0] as { id: string; freeConsultations: number } | undefined;
			const locked = await tx.execute(sql`
				SELECT state, generation FROM messages WHERE id = ${message.id} FOR UPDATE
			`);
			const current = locked[0] as
				| { state: string; generation: Record<string, unknown> }
				| undefined;
			if (!current || current.state !== "pending" || !user) return;
			await tx
				.update(messages)
				.set({
					state: "failed",
					content: await enc("Response interrupted. Please try again.", primaryKey),
					updatedAt: new Date(),
				})
				.where(eq(messages.id, message.id));
			if (current.generation?.sponsored && user.freeConsultations > 0) {
				await tx.execute(sql`
					UPDATE users SET free_consultations = free_consultations - 1, updated_at = now() WHERE id = ${user.id}
				`);
			}
			recovered += 1;
		}).catch(() => {
			// The owner may delete a conversation while recovery scans it.
		});
	}
	return { recovered };
}


