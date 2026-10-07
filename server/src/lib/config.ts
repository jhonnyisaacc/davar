import { allowedOrigins } from "../services/webOrigins.js";

export type AppEnv = "development" | "test" | "staging" | "production";

export interface ServerConfig {
	env: AppEnv;
	databaseUrl: string | undefined;
	apiPublicUrl: string;
	authReturnUris: string[];
	webOrigins: string[];
	sandbox: boolean;
	encryptionPrimaryKey: string;
	encryptionDeterministicKey: string;
	port: number;
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
	return {
		env,
		databaseUrl: source.DATABASE_URL,
		apiPublicUrl: source.API_PUBLIC_URL ?? "http://localhost:3000",
		authReturnUris: (source.AUTH_RETURN_URIS ?? "davar://auth/callback").split(","),
		webOrigins: allowedOrigins({
			configured: source.WEB_ORIGINS,
			development: env === "development",
		}),
		sandbox,
		encryptionPrimaryKey:
			source.DAVAR_ENCRYPTION_PRIMARY_KEY ??
			"davar-local-only-primary-key-0001",
		encryptionDeterministicKey:
			source.DAVAR_ENCRYPTION_DETERMINISTIC_KEY ??
			"davar-local-only-deterministic01",
		port: Number(source.PORT ?? 3000),
	};
}
