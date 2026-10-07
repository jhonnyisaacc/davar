import { and, eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { authAttempts, handoffs, users } from "../db/schema.js";
import { randomToken, sha256Hex } from "../lib/crypto.js";
import { DomainError } from "../lib/errors.js";
import { resolveAccount } from "./accounts.js";
import { asDateRequired, dec, decryptionRing, enc, type PreviousKeys } from "./fields.js";
import { issueSession } from "./sessions.js";
import {
	authorizationUrl,
	isOAuthProvider,
	providerAvailable,
	providerCredentials,
	providerSubject,
	type ProviderHttp,
} from "./oauth.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StartInput {
	provider: string;
	returnUri: string;
	email?: string | null;
	linkingUserId?: string | null;
	notificationConsent?: boolean;
	allowedReturnUris: string[];
	apiPublicUrl: string;
	primaryKey: string;
	deterministicKey: string;
	env?: NodeJS.ProcessEnv;
	sendMail: (to: string, state: string) => Promise<void>;
}

export async function startAuthentication(
	db: DatabaseOrTx,
	input: StartInput,
): Promise<{ email_sent: true } | { authorization_url: string }> {
	if (
		input.notificationConsent &&
		(input.provider !== "telegram" || !input.linkingUserId)
	) {
		throw new DomainError("invalid_notification_consent");
	}
	if (!input.allowedReturnUris.includes(input.returnUri)) {
		throw new DomainError("invalid_return_uri");
	}
	if (
		input.provider !== "email" &&
		(!isOAuthProvider(input.provider) || !providerAvailable(input.provider, input.env))
	) {
		throw new DomainError("provider_not_configured", 503);
	}
	const state = randomToken(48);
	const attempt = {
		provider: input.provider,
		stateDigest: await sha256Hex(state),
		nonce: randomToken(32),
		verifier: randomToken(48),
		returnUri: input.returnUri,
		userId: input.linkingUserId,
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		notificationConsentRequested: input.notificationConsent ?? false,
	};
	if (input.provider === "email") {
		const normalized = (input.email ?? "").trim().toLowerCase();
		if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
			throw new DomainError("invalid_email");
		}
		await db.insert(authAttempts).values({
			...attempt,
			userId: attempt.userId ?? null,
			email: await enc(normalized, input.primaryKey),
			verifier: await enc(attempt.verifier, input.primaryKey),
		});
		await input.sendMail(normalized, state);
		return { email_sent: true };
	}
	await db.insert(authAttempts).values({
		...attempt,
		userId: attempt.userId ?? null,
		verifier: await enc(attempt.verifier, input.primaryKey),
	});
	const [clientId] = providerCredentials(input.provider, input.env);
	const url = await authorizationUrl(
		{
			provider: input.provider,
			nonce: attempt.nonce,
			verifier: attempt.verifier,
			notificationConsentRequested: attempt.notificationConsentRequested,
		},
		state,
		clientId ?? "",
		input.apiPublicUrl,
	);
	return { authorization_url: url };
}

export interface FinishDeps {
	http?: ProviderHttp;
	env?: NodeJS.ProcessEnv;
}

export async function finishAuthentication(
	db: DatabaseOrTx,
	input: {
		provider: string;
		state: string | null | undefined;
		code?: string | null;
		apiPublicUrl: string;
		primaryKey: string;
		deterministicKey: string;
	} & PreviousKeys,
	deps: FinishDeps = {},
): Promise<string> {
	if (!input.state) throw new DomainError("invalid_state", 401);
	const digest = await sha256Hex(input.state);
	const keys = decryptionRing(input.primaryKey, input.previousKeys);
	return db.transaction(async (tx) => {
		const rows = await tx.execute(
			sql`SELECT * FROM auth_attempts WHERE state_digest = ${digest} AND provider = ${input.provider} FOR UPDATE`,
		);
		const attempt = rows[0] as
			| {
					id: string;
					provider: string;
					nonce: string | null;
					verifier: string | null;
					return_uri: string;
					user_id: string | null;
					expires_at: Date;
					consumed_at: Date | null;
					email: string | null;
					notification_consent_requested: boolean;
			  }
			| undefined;
		if (!attempt) throw new DomainError("not_found", 404);
		if (attempt.consumed_at || asDateRequired(attempt.expires_at).getTime() <= Date.now()) {
			throw new DomainError("expired_or_used_link", 401);
		}
		let subject: string;
		if (input.provider === "email") {
			const email = await dec(attempt.email, keys);
			if (!email) throw new DomainError("expired_or_used_link", 401);
			subject = email;
		} else {
			const verifier = await dec(attempt.verifier, keys);
			subject = await providerSubject(
				{ provider: input.provider, nonce: attempt.nonce, verifier },
				input.code,
				{ env: deps.env, http: deps.http, apiPublicUrl: input.apiPublicUrl },
			);
		}
		const user = await resolveAccount(tx, {
			provider: input.provider,
			subject,
			linkingUserId: attempt.user_id,
			primaryKey: input.primaryKey,
			deterministicKey: input.deterministicKey,
		});
		if (attempt.notification_consent_requested) {
			const current = await tx.execute(
				sql`SELECT settings, settings_version AS "settingsVersion" FROM users WHERE id = ${user.id} FOR UPDATE`,
			);
			const row = current[0] as { settings: Record<string, unknown>; settingsVersion: number };
			await tx
				.update(users)
				.set({
					settings: { ...(row.settings ?? {}), telegram_notifications: true },
					settingsVersion: row.settingsVersion + 1,
					updatedAt: new Date(),
				})
				.where(eq(users.id, user.id));
		}
		const session = await issueSession(tx, user.id);
		const handoffCode = randomToken(48);
		await tx.insert(handoffs).values({
			sessionId: session.id,
			codeDigest: await sha256Hex(handoffCode),
			token: await enc(session.token, input.primaryKey) ?? session.token,
			expiresAt: new Date(Date.now() + 60 * 1000),
		});
		await tx
			.update(authAttempts)
			.set({ consumedAt: new Date(), updatedAt: new Date() })
			.where(eq(authAttempts.id, attempt.id));
		const uri = new URL(attempt.return_uri);
		uri.searchParams.set("code", handoffCode);
		return uri.toString();
	});
}

export async function exchangeHandoff(
	db: DatabaseOrTx,
	input: { code: string | null | undefined; primaryKey: string } & PreviousKeys,
): Promise<string> {
	if (!input.code) throw new DomainError("invalid_handoff", 401);
	const digest = await sha256Hex(input.code);
	return db.transaction(async (tx) => {
		const rows = await tx.execute(
			sql`SELECT handoffs.id, handoffs.token, handoffs.expires_at AS "expiresAt", sessions.revoked_at AS "revokedAt" FROM handoffs JOIN sessions ON sessions.id = handoffs.session_id WHERE handoffs.code_digest = ${digest} FOR UPDATE OF handoffs`,
		);
		const handoff = rows[0] as
			| { id: string; token: string; expiresAt: Date | string; revokedAt: Date | string | null }
			| undefined;
		if (!handoff) throw new DomainError("not_found", 404);
		if (asDateRequired(handoff.expiresAt).getTime() <= Date.now() || handoff.revokedAt) {
			throw new DomainError("expired_handoff", 401);
		}
		const token =
			(await dec(handoff.token, decryptionRing(input.primaryKey, input.previousKeys))) ??
			handoff.token;
		await tx.delete(handoffs).where(eq(handoffs.id, handoff.id));
		return token;
	});
}
