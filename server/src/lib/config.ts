import { z } from "zod";
import { parseHostList } from "./hosts.js";
import { allowedOrigins } from "../services/webOrigins.js";
import { DEFAULT_TRUSTED_PROXIES } from "../services/remoteIp.js";

export type AppEnv = "development" | "test" | "staging" | "production";

export interface ServerConfig {
	env: AppEnv;
	databaseUrl: string | undefined;
	poolSize: number;
	apiPublicUrl: string;
	authReturnUris: string[];
	webOrigins: string[];
	allowedHosts: string[];
	trustedProxies: string[];
	sandbox: boolean;
	encryptionPrimaryKey: string;
	encryptionPreviousKeys: string[];
	encryptionDeterministicKey: string;
	port: number;
}

const APP_ENVS = ["development", "test", "staging", "production"] as const;

const LOCAL_DB_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1"]);

const rawEnvSchema = z.object({
	NODE_ENV: z.string().optional(),
	DATABASE_URL: z.string().optional(),
	DATABASE_POOL_SIZE: z.string().optional(),
	PORT: z.string().optional(),
	API_PUBLIC_URL: z.string().optional(),
	API_HOSTS: z.string().optional(),
	AUTH_RETURN_URIS: z.string().optional(),
	WEB_ORIGINS: z.string().optional(),
	TRUSTED_PROXIES: z.string().optional(),
	DAVAR_DEV_SANDBOX: z.string().optional(),
	DAVAR_ENCRYPTION_PRIMARY_KEY: z.string().optional(),
	DAVAR_ENCRYPTION_PREVIOUS_KEYS: z.string().optional(),
	DAVAR_ENCRYPTION_DETERMINISTIC_KEY: z.string().optional(),
});

type RawEnv = z.infer<typeof rawEnvSchema>;

function appEnvOf(value: string | undefined): AppEnv | undefined {
	const name = value?.trim() || "development";
	return (APP_ENVS as readonly string[]).includes(name) ? (name as AppEnv) : undefined;
}

function present(value: string | undefined): value is string {
	return value !== undefined && value.trim() !== "";
}

function optionalPositiveInt(value: string | undefined, fallback: number): number | undefined {
	if (value === undefined || value === "") return fallback;
	if (!/^[1-9]\d*$/.test(value)) return undefined;
	return Number(value);
}

function databaseHost(url: string | undefined): string {
	if (!url) return "";
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return "";
	}
}

function splitList(value: string | undefined, fallback = ""): string[] {
	return (value ?? fallback)
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function issue(ctx: z.RefinementCtx, message: string, path: string): void {
	ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
}

// One schema for process env. Hosted boot (staging/production) fails closed.
// Bun itself loads `.env`; this does not read env files.
export const serverEnvSchema: z.ZodType<ServerConfig, z.ZodTypeDef, RawEnv> = rawEnvSchema
	.superRefine((env, ctx) => {
		const name = appEnvOf(env.NODE_ENV);
		if (!name) {
			issue(
				ctx,
				"NODE_ENV must be development, test, staging, or production",
				"NODE_ENV",
			);
			return;
		}
		if (env.DAVAR_DEV_SANDBOX === "1" && name !== "development") {
			issue(ctx, "DAVAR_DEV_SANDBOX is development-only", "DAVAR_DEV_SANDBOX");
			return;
		}
		if (name === "staging" || name === "production") {
			for (const key of [
				"DAVAR_ENCRYPTION_PRIMARY_KEY",
				"DAVAR_ENCRYPTION_DETERMINISTIC_KEY",
			] as const) {
				if (!env[key]) {
					issue(ctx, `${key} is required`, key);
					return;
				}
			}
			const missing = ["DATABASE_URL", "API_PUBLIC_URL", "API_HOSTS"].filter(
				(key) => !present(env[key as keyof RawEnv] as string | undefined),
			);
			if (missing.length > 0) {
				issue(ctx, `Missing ${name} configuration: ${missing.join(", ")}`, missing[0] ?? "NODE_ENV");
				return;
			}
			try {
				const url = new URL(env.API_PUBLIC_URL as string);
				if (url.protocol !== "https:" || !url.host) {
					issue(ctx, `API_PUBLIC_URL must use HTTPS in ${name}`, "API_PUBLIC_URL");
					return;
				}
			} catch {
				issue(ctx, `API_PUBLIC_URL must use HTTPS in ${name}`, "API_PUBLIC_URL");
				return;
			}
		}
		if (optionalPositiveInt(env.PORT, 3000) === undefined) {
			issue(ctx, "PORT must be a positive integer", "PORT");
			return;
		}
		if (optionalPositiveInt(env.DATABASE_POOL_SIZE, 5) === undefined) {
			issue(ctx, "DATABASE_POOL_SIZE must be a positive integer", "DATABASE_POOL_SIZE");
			return;
		}
		if (
			!LOCAL_DB_HOSTS.has(databaseHost(env.DATABASE_URL)) &&
			(!env.DAVAR_ENCRYPTION_PRIMARY_KEY || !env.DAVAR_ENCRYPTION_DETERMINISTIC_KEY)
		) {
			issue(
				ctx,
				"Refuses default encryption keys with a non-local DATABASE_URL: set DAVAR_ENCRYPTION_PRIMARY_KEY and DAVAR_ENCRYPTION_DETERMINISTIC_KEY.",
				"DATABASE_URL",
			);
		}
	})
	.transform((env): ServerConfig => {
		const name = appEnvOf(env.NODE_ENV) ?? "development";
		const port = optionalPositiveInt(env.PORT, 3000) ?? 3000;
		const poolSize = optionalPositiveInt(env.DATABASE_POOL_SIZE, 5) ?? 5;
		return {
			env: name,
			databaseUrl: env.DATABASE_URL,
			poolSize,
			apiPublicUrl: env.API_PUBLIC_URL ?? "http://localhost:3000",
			authReturnUris: splitList(env.AUTH_RETURN_URIS, "davar://auth/callback"),
			webOrigins: allowedOrigins({
				configured: env.WEB_ORIGINS,
				development: name === "development",
			}),
			allowedHosts: parseHostList(env.API_HOSTS),
			trustedProxies:
				env.TRUSTED_PROXIES === undefined
					? [...DEFAULT_TRUSTED_PROXIES]
					: splitList(env.TRUSTED_PROXIES),
			sandbox: env.DAVAR_DEV_SANDBOX === "1",
			encryptionPrimaryKey:
				env.DAVAR_ENCRYPTION_PRIMARY_KEY ?? "davar-local-only-primary-key-0001",
			encryptionPreviousKeys: splitList(env.DAVAR_ENCRYPTION_PREVIOUS_KEYS),
			encryptionDeterministicKey:
				env.DAVAR_ENCRYPTION_DETERMINISTIC_KEY ?? "davar-local-only-deterministic01",
			port,
		};
	});

// Ordered decryption ring: the current primary first, then previous keys
// kept only to open rows written before a rotation.
export function decryptionKeys(input: {
	encryptionPrimaryKey: string;
	encryptionPreviousKeys: string[];
}): string[] {
	return [input.encryptionPrimaryKey, ...input.encryptionPreviousKeys];
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): ServerConfig {
	const parsed = serverEnvSchema.safeParse({ ...source });
	if (!parsed.success) {
		throw new Error(parsed.error.issues[0]?.message ?? "Invalid server environment");
	}
	return parsed.data;
}
