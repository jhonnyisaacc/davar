import { allowedOrigins } from "../services/webOrigins.js";
import { DEFAULT_TRUSTED_PROXIES } from "../services/remoteIp.js";

export type AppEnv = "development" | "test" | "staging" | "production";

export interface ServerConfig {
	env: AppEnv;
	databaseUrl: string | undefined;
	apiPublicUrl: string;
	authReturnUris: string[];
	webOrigins: string[];
	trustedProxies: string[];
	sandbox: boolean;
	encryptionPrimaryKey: string;
	encryptionPreviousKeys: string[];
	encryptionDeterministicKey: string;
	port: number;
}

// Ordered decryption ring: the current primary first, then previous keys
// kept only to open rows written before a rotation.
export function decryptionKeys(input: {
	encryptionPrimaryKey: string;
	encryptionPreviousKeys: string[];
}): string[] {
	return [input.encryptionPrimaryKey, ...input.encryptionPreviousKeys];
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): ServerConfig {
	const env = (source.NODE_ENV ?? "development") as AppEnv;
	const sandbox = source.DAVAR_DEV_SANDBOX === "1";
	if (sandbox && env !== "development") {
		throw new Error("DAVAR_DEV_SANDBOX is development-only");
	}
	if (env === "staging" || env === "production") {
		for (const key of [
			"DAVAR_ENCRYPTION_PRIMARY_KEY",
			"DAVAR_ENCRYPTION_DETERMINISTIC_KEY",
		] as const) {
			if (!source[key]) throw new Error(`${key} is required`);
		}
		const missing = ["DATABASE_URL", "API_PUBLIC_URL"].filter(
			(key) => !source[key],
		);
		if (missing.length > 0) {
			throw new Error(`Missing ${env} configuration: ${missing.join(", ")}`);
		}
		const url = new URL(source.API_PUBLIC_URL as string);
		if (url.protocol !== "https:" || !url.host) {
			throw new Error(`API_PUBLIC_URL must use HTTPS in ${env}`);
		}
	}
	const dbHost = (() => {
		try {
			return new URL(source.DATABASE_URL ?? "").hostname.toLowerCase();
		} catch {
			return "";
		}
	})();
	// Fail closed: default local keys must never protect a remote database.
	// Staging/production already require real keys above.
	if (
		!["", "localhost", "127.0.0.1", "::1"].includes(dbHost) &&
		(!source.DAVAR_ENCRYPTION_PRIMARY_KEY || !source.DAVAR_ENCRYPTION_DETERMINISTIC_KEY)
	) {
		throw new Error(
			"Refuses default encryption keys with a non-local DATABASE_URL: set DAVAR_ENCRYPTION_PRIMARY_KEY and DAVAR_ENCRYPTION_DETERMINISTIC_KEY.",
		);
	}
	return {
		env,
		databaseUrl: source.DATABASE_URL,
		apiPublicUrl: source.API_PUBLIC_URL ?? "http://localhost:3000",
		authReturnUris: (source.AUTH_RETURN_URIS ?? "davar://auth/callback")
			.split(",")
			.map((part) => part.trim())
			.filter((part) => part.length > 0),
		webOrigins: allowedOrigins({
			configured: source.WEB_ORIGINS,
			development: env === "development",
		}),
		trustedProxies:
			source.TRUSTED_PROXIES === undefined
				? [...DEFAULT_TRUSTED_PROXIES]
				: source.TRUSTED_PROXIES.split(",")
						.map((part) => part.trim())
						.filter((part) => part.length > 0),
		sandbox,
		encryptionPrimaryKey:
			source.DAVAR_ENCRYPTION_PRIMARY_KEY ??
			"davar-local-only-primary-key-0001",
		encryptionPreviousKeys: (source.DAVAR_ENCRYPTION_PREVIOUS_KEYS ?? "")
			.split(",")
			.map((part) => part.trim())
			.filter((part) => part.length > 0),
		encryptionDeterministicKey:
			source.DAVAR_ENCRYPTION_DETERMINISTIC_KEY ??
			"davar-local-only-deterministic01",
		port: Number(source.PORT ?? 3000),
	};
}
