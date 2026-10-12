import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { sessions, users } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import {
	exchangeHandoff,
	finishAuthentication,
	startAuthentication,
} from "../../services/authentication.js";
import { enc } from "../../services/fields.js";
import { authenticateSession, issueSession } from "../../services/sessions.js";
import { providerAvailable } from "../../services/oauth.js";
import { developmentOpenrouter } from "../../services/provider.js";
import { sendSignInMail } from "../../services/mailer.js";
import { sandboxEnabled } from "../../services/sandbox.js";
import { requireFlag } from "../../services/flags.js";
import { checkRateLimit } from "../../services/rateLimit.js";
import { bearerToken, clientIp, currentUser, requireUser } from "../auth.js";
import { parseBody, parseQuery } from "../validation.js";
import type { AppVariables } from "../deps.js";
import { z } from "zod";

const PROVIDER_ORDER = ["google", "apple", "facebook", "telegram", "x", "email"];

const startSchema = z.object({
	return_uri: z.string().optional(),
	email: z.string().optional().nullable(),
	// Rails compares params[:link] / params[:notification_consent] with ==
	// true, so strings are accepted and ignored; only a real boolean opts in.
	link: z.union([z.boolean(), z.string()]).optional(),
	notification_consent: z.union([z.boolean(), z.string()]).optional(),
});

const exchangeSchema = z.object({
	code: z.string().optional().nullable(),
});

export const authRoutes = new Hono<{ Variables: AppVariables }>();

authRoutes.post("/guest", async (c) => {
	const { db } = c.get("deps");
	await checkRateLimit(db, `guest/${clientIp(c)}`, 3);
	const created = await db
		.insert(users)
		.values({ displayName: await enc("Guest", c.get("deps").config.encryptionPrimaryKey) })
		.returning({ id: users.id });
	const row = created[0];
	if (!row) throw new Error("Guest insert failed");
	const session = await issueSession(db, row.id);
	return c.json({ token: session.token }, 201);
});

authRoutes.get("/providers", async (c) => {
	const { env } = c.get("deps");
	return c.json({
		providers: PROVIDER_ORDER.map((id) => ({
			id,
			available: id === "email" || providerAvailable(id, env),
		})),
		commentary_provider: developmentOpenrouter(env, env.NODE_ENV ?? "development")
			? "openrouter"
			: null,
	});
});

authRoutes.post("/exchange", async (c) => {
	const { db, config } = c.get("deps");
	await checkRateLimit(db, `exchange/${clientIp(c)}`, 20);
	const body = parseBody(exchangeSchema, await c.req.json().catch(() => ({})));
	const token = await exchangeHandoff(db, {
		code: body.code,
		primaryKey: config.encryptionPrimaryKey,
		previousKeys: config.encryptionPreviousKeys,
	});
	return c.json({ token });
});

authRoutes.delete("/session", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireUser(db, config, c);
	const token = bearerToken(c);
	const session = await authenticateSession(db, token);
	if (session && session.userId === user.id) {
		await db
			.update(sessions)
			.set({ revokedAt: new Date(), updatedAt: new Date() })
			.where(eq(sessions.id, session.id));
	}
	return c.body(null, 204);
});

authRoutes.post("/:provider/start", async (c) => {
	const { db, config, env, outbox, rootDir, flags, http } = c.get("deps");
	const sessionUser = await currentUser(db, config, c);
	await requireFlag("account_sign_in", sessionUser?.id ?? null, { env, http, flags });
	const provider = c.req.param("provider");
	await checkRateLimit(db, `auth/${clientIp(c)}`, 10);
	const body = parseBody(startSchema, await c.req.json().catch(() => ({})));
	let linkingUserId: string | null = null;
	if (body.link === true) {
		const user = await requireUser(db, config, c);
		linkingUserId = user.id;
	}
	const query = parseQuery(
		z.object({
			return_uri: z.string().optional(),
			email: z.string().optional().nullable(),
		}),
		c.req.query(),
	);
	const sandbox = sandboxEnabled(env, env.NODE_ENV ?? "development");
	const result = await startAuthentication(db, {
		provider,
		returnUri: body.return_uri ?? query.return_uri ?? "",
		email: body.email ?? query.email,
		linkingUserId,
		notificationConsent: body.notification_consent === true,
		allowedReturnUris: config.authReturnUris,
		apiPublicUrl: config.apiPublicUrl,
		primaryKey: config.encryptionPrimaryKey,
		deterministicKey: config.encryptionDeterministicKey,
		env,
		sendMail: (to, state) =>
			sendSignInMail({
				to,
				state,
				apiPublicUrl: config.apiPublicUrl,
				mailFrom: env.MAIL_FROM ?? "Davar <sign-in@localhost>",
				sandbox,
				rootDir,
				outbox,
				env,
			}),
	});
	return c.json(result);
});

async function callbackHandler(c: {
	req: {
		param(key: string): string;
		query(): Record<string, string>;
		method: string;
		parseBody(): Promise<Record<string, string | File>>;
	};
	get(key: "deps"): AppVariables["deps"];
	redirect(url: string, status?: 301 | 302 | 303 | 307 | 308): Response;
}) {
	const { db, config, env, http } = c.get("deps");
	const params: Record<string, string> = { ...c.req.query() };
	if (c.req.method === "POST") {
		// Apple uses response_mode=form_post, so the code and state arrive in
		// the form body rather than the query string.
		const form = await c.req.parseBody().catch(() => ({}));
		for (const [key, value] of Object.entries(form)) {
			if (typeof value === "string") params[key] = value;
		}
	}
	if (params.error) throw new DomainError("provider_denied", 401);
	const url = await finishAuthentication(
		db,
		{
			provider: c.req.param("provider"),
			state: params.state,
			code: params.code,
			apiPublicUrl: config.apiPublicUrl,
			primaryKey: config.encryptionPrimaryKey,
			previousKeys: config.encryptionPreviousKeys,
			deterministicKey: config.encryptionDeterministicKey,
		},
		{ env, http },
	);
	return c.redirect(url, 302);
}

authRoutes.get("/:provider/callback", (c) => callbackHandler(c));
authRoutes.post("/:provider/callback", (c) => callbackHandler(c));
