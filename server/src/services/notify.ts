import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { identities, notifications, users } from "../db/schema.js";
import { DomainError } from "../lib/errors.js";
import { sandboxEnabled } from "./sandbox.js";
import { dec, decryptionRing, type PreviousKeys } from "./fields.js";
import type { ProviderHttp } from "./oauth.js";
import { fetchHttp } from "./oauth.js";

export interface NotifyResult {
	delivered: number;
	attempted: number;
	skipped: boolean;
}

export async function deliverTelegramNotifications(
	db: DatabaseOrTx,
	input: {
		env?: NodeJS.ProcessEnv;
		http?: ProviderHttp;
		limit?: number;
		primaryKey?: string;
	} & PreviousKeys = {},
): Promise<NotifyResult> {
	const env = input.env ?? process.env;
	if (sandboxEnabled(env, env.NODE_ENV ?? "development")) {
		return { delivered: 0, attempted: 0, skipped: true };
	}
	const botToken = env.TELEGRAM_BOT_TOKEN;
	if (!botToken) return { delivered: 0, attempted: 0, skipped: true };
	const http = input.http ?? fetchHttp;
	const pending = await db
		.select()
		.from(notifications)
		.where(and(isNull(notifications.deliveredAt), lt(notifications.deliveryAttempts, 5)))
		.limit(input.limit ?? 100);
	let delivered = 0;
	for (const notification of pending) {
		await db.transaction(async (tx) => {
			const locked = await tx.execute(sql`
				SELECT delivered_at AS "deliveredAt" FROM notifications WHERE id = ${notification.id} FOR UPDATE
			`);
			const current = locked[0] as { deliveredAt: Date | null } | undefined;
			if (!current || current.deliveredAt) return;
			const owner = await tx
				.select({ settings: users.settings })
				.from(users)
				.where(eq(users.id, notification.userId))
				.limit(1);
			const telegram = await tx
				.select({ subject: identities.subject })
				.from(identities)
				.where(
					and(
						eq(identities.userId, notification.userId),
						eq(identities.provider, "telegram"),
					),
				)
				.limit(1);
			const settings = (owner[0]?.settings ?? {}) as Record<string, unknown>;
			// Without the encryption key there is no chat to deliver to; the
			// notification stays queued for a configured run.
			const primaryKey = input.primaryKey;
			if (!primaryKey) return;
			const chatId = telegram[0]
				? await dec(telegram[0].subject, decryptionRing(primaryKey, input.previousKeys))
				: null;
			if (!chatId || settings.telegram_notifications !== true) return;
			await tx
				.update(notifications)
				.set({ deliveryAttempts: notification.deliveryAttempts + 1, updatedAt: new Date() })
				.where(eq(notifications.id, notification.id));
			try {
				await http.json(`https://api.telegram.org/bot${botToken}/sendMessage`, {
					method: "post",
					body: {
						chat_id: chatId,
						text: `Davar: ${notification.kind.replace(/_/g, " ")}. Open Assemblies to review.`,
					},
				});
				await tx
					.update(notifications)
					.set({ deliveredAt: new Date(), deliveryError: null, updatedAt: new Date() })
					.where(eq(notifications.id, notification.id));
				delivered += 1;
			} catch (error) {
				const code = error instanceof DomainError ? error.code : "delivery_failed";
				await tx
					.update(notifications)
					.set({ deliveryError: code, updatedAt: new Date() })
					.where(eq(notifications.id, notification.id));
			}
		});
	}
	return { delivered, attempted: pending.length, skipped: false };
}
