import { and, eq } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { identities, users } from "../db/schema.js";
import { derivedHmacHex } from "../lib/codec.js";
import { DomainError } from "../lib/errors.js";
import { enc } from "./fields.js";

export function isUniqueViolation(error: unknown): boolean {
	const code = (error as { code?: unknown }).code;
	if (code === "23505") return true;
	const message = (error as { message?: unknown }).message;
	return typeof message === "string" && message.includes("duplicate key value");
}

export async function subjectDigest(
	subject: string,
	deterministicKey: string,
): Promise<string> {
	return derivedHmacHex(`identity-subject:${subject}`, deterministicKey);
}

const PROVIDERS = ["google", "apple", "facebook", "telegram", "x", "email"] as const;

export async function resolveAccount(
	db: DatabaseOrTx,
	input: {
		provider: string;
		subject: string;
		linkingUserId?: string | null;
		primaryKey: string;
		deterministicKey: string;
	},
): Promise<{ id: string }> {
	if (!(PROVIDERS as readonly string[]).includes(input.provider)) {
		throw new DomainError("invalid_provider");
	}
	if (!input.subject) throw new DomainError("invalid_subject");
	const digest = await subjectDigest(input.subject, input.deterministicKey);
	for (let attempt = 0; attempt < 3; attempt++) {
		const found = await db
			.select()
			.from(identities)
			.where(and(eq(identities.provider, input.provider), eq(identities.subjectDigest, digest)))
			.limit(1);
		const identity = found[0];
		if (identity) {
			if (input.linkingUserId && identity.userId !== input.linkingUserId) {
				throw new DomainError("identity_already_linked", 409);
			}
			return { id: identity.userId };
		}
		try {
			let userId = input.linkingUserId ?? null;
			if (!userId) {
				const created = await db
					.insert(users)
					.values({ displayName: await enc("Reader", input.primaryKey) })
					.returning({ id: users.id });
				const row = created[0];
				if (!row) throw new Error("User insert failed");
				userId = row.id;
			}
			await db.insert(identities).values({
				userId,
				provider: input.provider,
				subject: await enc(input.subject, input.primaryKey),
				subjectDigest: digest,
			});
			return { id: userId };
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
			if (input.linkingUserId) throw new DomainError("identity_already_linked", 409);
		}
	}
	const found = await db
		.select()
		.from(identities)
		.where(and(eq(identities.provider, input.provider), eq(identities.subjectDigest, digest)))
		.limit(1);
	if (!found[0]) throw new Error("Identity resolution failed");
	return { id: found[0].userId };
}
