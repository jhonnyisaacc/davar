import { createLocalJWKSet, jwtVerify } from "jose";
import { DomainError } from "../lib/errors.js";
import { pkceChallenge } from "../lib/crypto.js";

export const OAUTH_PROVIDERS = {
	google: {
		auth: "https://accounts.google.com/o/oauth2/v2/auth",
		token: "https://oauth2.googleapis.com/token",
		jwks: "https://www.googleapis.com/oauth2/v3/certs",
		issuer: "https://accounts.google.com",
		scope: "openid",
	},
	apple: {
		auth: "https://appleid.apple.com/auth/authorize",
		token: "https://appleid.apple.com/auth/token",
		jwks: "https://appleid.apple.com/auth/keys",
		issuer: "https://appleid.apple.com",
		scope: null,
	},
	telegram: {
		auth: "https://oauth.telegram.org/auth",
		token: "https://oauth.telegram.org/token",
		jwks: "https://oauth.telegram.org/.well-known/jwks.json",
		issuer: "https://oauth.telegram.org",
		scope: "openid profile",
	},
	facebook: {
		auth: "https://www.facebook.com/v24.0/dialog/oauth",
		token: "https://graph.facebook.com/v24.0/oauth/access_token",
		jwks: null,
		issuer: null,
		scope: "public_profile",
	},
	x: {
		auth: "https://x.com/i/oauth2/authorize",
		token: "https://api.x.com/2/oauth2/token",
		jwks: null,
		issuer: null,
		scope: "users.read tweet.read",
	},
} as const;

export type OAuthProviderId = keyof typeof OAUTH_PROVIDERS;

export function isOAuthProvider(value: string): value is OAuthProviderId {
	return Object.hasOwn(OAUTH_PROVIDERS, value);
}

export function providerCredentials(
	provider: string,
	env: NodeJS.ProcessEnv = process.env,
): [string | undefined, string | undefined] {
	const prefix = provider.toUpperCase();
	return [env[`${prefix}_CLIENT_ID`], env[`${prefix}_CLIENT_SECRET`]];
}

export function providerAvailable(
	provider: string,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (!isOAuthProvider(provider)) return false;
	const [id, secret] = providerCredentials(provider, env);
	return Boolean(id && secret);
}

export function providerCallback(
	provider: string,
	apiPublicUrl: string,
): string {
	const base = apiPublicUrl.replace(/\/$/, "");
	return `${base}/api/v1/auth/${provider}/callback`;
}

export interface AuthorizationAttempt {
	provider: string;
	nonce: string | null;
	verifier: string | null;
	notificationConsentRequested: boolean;
}

export async function authorizationUrl(
	attempt: AuthorizationAttempt,
	state: string,
	clientId: string,
	apiPublicUrl: string,
): Promise<string> {
	const config = OAUTH_PROVIDERS[attempt.provider as OAuthProviderId];
	const args: Record<string, string> = {
		client_id: clientId,
		redirect_uri: providerCallback(attempt.provider, apiPublicUrl),
		response_type: "code",
		state,
	};
	if (config.scope) args.scope = config.scope;
	if (
		attempt.provider === "telegram" &&
		attempt.notificationConsentRequested &&
		args.scope
	) {
		args.scope += " telegram:bot_access";
	}
	if (config.jwks && attempt.nonce) args.nonce = attempt.nonce;
	if (attempt.provider !== "apple" && attempt.provider !== "facebook") {
		if (!attempt.verifier) throw new DomainError("invalid_state", 401);
		args.code_challenge = await pkceChallenge(attempt.verifier);
		args.code_challenge_method = "S256";
	}
	if (attempt.provider === "apple") args.response_mode = "form_post";
	return `${config.auth}?${new URLSearchParams(args).toString()}`;
}

export interface ProviderHttp {
	json(
		url: string,
		options?: {
			method?: "get" | "post";
			form?: Record<string, string>;
			body?: unknown;
			headers?: Record<string, string>;
			basic?: [string, string];
			openTimeoutMs?: number;
			readTimeoutMs?: number;
		},
	): Promise<unknown>;
}

export const fetchHttp: ProviderHttp = {
	async json(url, options = {}) {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") throw new DomainError("invalid_provider_url");
		const headers: Record<string, string> = { ...(options.headers ?? {}) };
		let body: string | URLSearchParams | undefined;
		if (options.form) {
			body = new URLSearchParams(options.form);
		} else if (options.body !== undefined) {
			headers["Content-Type"] = "application/json";
			body = JSON.stringify(options.body);
		}
		if (options.basic) {
			const [user, pass] = options.basic;
			headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
		}
		const controller = new AbortController();
		const timeoutMs = Math.max(options.openTimeoutMs ?? 5000, options.readTimeoutMs ?? 30000);
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, {
				method: options.method === "post" ? "POST" : "GET",
				headers,
				body,
				signal: controller.signal,
			});
			if (!response.ok) throw new DomainError("provider_unavailable", 503);
			return (await response.json()) as unknown;
		} catch (error) {
			if (error instanceof DomainError) throw error;
			throw new DomainError("provider_unavailable", 503);
		} finally {
			clearTimeout(timeout);
		}
	},
};

const jwksCache = new Map<string, { expires: number; value: unknown }>();

export function clearJwksCache(): void {
	jwksCache.clear();
}

export async function providerSubject(
	attempt: { provider: string; nonce: string | null; verifier: string | null },
	code: string | null | undefined,
	input: {
		env?: NodeJS.ProcessEnv;
		http?: ProviderHttp;
		apiPublicUrl?: string;
	} = {},
): Promise<string> {
	const env = input.env ?? process.env;
	const http = input.http ?? fetchHttp;
	const provider = attempt.provider;
	if (!isOAuthProvider(provider)) throw new DomainError("invalid_provider_identity", 401);
	const config = OAUTH_PROVIDERS[provider];
	const [clientId, clientSecret] = providerCredentials(provider, env);
	const apiPublicUrl = input.apiPublicUrl ?? env.API_PUBLIC_URL ?? "http://localhost:3000";
	const form: Record<string, string> = {
		grant_type: "authorization_code",
		code: code ?? "",
		redirect_uri: providerCallback(provider, apiPublicUrl),
		client_id: clientId ?? "",
	};
	let token: Record<string, string>;
	if (provider === "x" || provider === "telegram") {
		if (!attempt.verifier) throw new DomainError("invalid_provider_identity", 401);
		form.code_verifier = attempt.verifier;
		token = (await http.json(config.token, {
			method: "post",
			form,
			basic: [clientId ?? "", clientSecret ?? ""],
		})) as Record<string, string>;
	} else {
		form.client_secret = clientSecret ?? "";
		if (provider === "google" && attempt.verifier) form.code_verifier = attempt.verifier;
		token = (await http.json(config.token, { method: "post", form })) as Record<string, string>;
	}
	try {
		if (config.jwks) {
			const cached = jwksCache.get(provider);
			let keys: unknown = cached && cached.expires > Date.now() ? cached.value : null;
			if (!keys) {
				keys = await http.json(config.jwks);
				jwksCache.set(provider, { expires: Date.now() + 60 * 60 * 1000, value: keys });
			}
			if (!token.id_token) throw new DomainError("invalid_provider_identity", 401);
			const set = createLocalJWKSet(
				keys as unknown as import("jose").JSONWebKeySet,
			);
			const { payload } = await jwtVerify(token.id_token, set, {
				issuer: config.issuer ?? undefined,
				audience: clientId,
				requiredClaims: ["sub", "iss", "aud", "exp", "iat"],
			});
			if ((payload.nonce as unknown) !== attempt.nonce) {
				throw new DomainError("invalid_nonce", 401);
			}
			if (provider === "telegram") {
				const id = (payload as Record<string, unknown>).id;
				if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
					throw new DomainError("telegram_user_id_missing", 401);
				}
				return String(id);
			}
			const sub = payload.sub;
			if (!sub) throw new DomainError("invalid_provider_identity", 401);
			return sub;
		}
		const access = token.access_token;
		if (!access) throw new DomainError("invalid_provider_identity", 401);
		if (provider === "x") {
			const me = (await http.json("https://api.x.com/2/users/me", {
				headers: { Authorization: `Bearer ${access}` },
			})) as { data: { id: string } };
			return me.data.id;
		}
		const { hmacSha256Hex } = await import("../lib/codec.js");
		const proof = await hmacSha256Hex(clientSecret ?? "", access);
		const me = (await http.json(
			`https://graph.facebook.com/v24.0/me?fields=id&appsecret_proof=${proof}`,
			{ headers: { Authorization: `Bearer ${access}` } },
		)) as { id: string };
		return me.id;
	} catch (error) {
		if (error instanceof DomainError) throw error;
		throw new DomainError("invalid_provider_identity", 401);
	}
}
