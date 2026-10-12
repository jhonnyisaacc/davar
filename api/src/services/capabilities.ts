import { eq } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { providerConnections } from "../db/schema.js";
import { checkRateLimit, rateLimitAvailable } from "./rateLimit.js";
import { evaluateFlags, type FlagSet, type FlagsDeps } from "./flags.js";
import {
	availableProviders,
	developmentOpenrouter,
	sharedModel,
	sharedOpenrouter,
} from "./provider.js";
import { sandboxEnabled } from "./sandbox.js";

export interface Capabilities {
	flags: FlagSet;
	ai: { available: boolean; shared_openrouter: boolean; providers: string[] };
}

export interface CapabilitiesDeps extends FlagsDeps {
	sandbox?: boolean;
}

export function dailySharedLimit(env: NodeJS.ProcessEnv = process.env): number {
	const parsed = Number(env.SHARED_AI_DAILY_LIMIT ?? "50");
	if (!Number.isFinite(parsed)) return 50;
	return Math.min(1000, Math.max(1, Math.floor(parsed)));
}

export async function sharedAvailable(
	db: DatabaseOrTx,
	env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
	return (
		(await rateLimitAvailable(db, "shared-ai/minute", 20)) &&
		(await rateLimitAvailable(db, "shared-ai/day", dailySharedLimit(env), 86400))
	);
}

export async function productCapabilities(
	db: DatabaseOrTx,
	input: {
		userId?: string | null;
		env?: NodeJS.ProcessEnv;
		nodeEnv?: string;
		flags?: FlagSet | null;
		http?: CapabilitiesDeps["http"];
	},
): Promise<Capabilities> {
	const env = input.env ?? process.env;
	const flags = await evaluateFlags(input.userId ?? null, {
		env,
		http: input.http,
		flags: input.flags,
	});
	const providers = flags.ai_provider_connections ? availableProviders(env) : [];
	const shared =
		flags.ai_shared_openrouter && sharedOpenrouter(env) && (await sharedAvailable(db, env));
	const sandbox = sandboxEnabled(env, input.nodeEnv ?? env.NODE_ENV ?? "development");
	const development =
		flags.ai_shared_openrouter && (developmentOpenrouter(env, input.nodeEnv ?? env.NODE_ENV ?? "development") || sandbox);
	let connected = false;
	if (input.userId && providers.length > 0) {
		const owned = await db
			.select({ provider: providerConnections.provider })
			.from(providerConnections)
			.where(eq(providerConnections.userId, input.userId));
		connected = owned.some((row) => providers.includes(row.provider));
	}
	return {
		flags,
		ai: {
			available: Boolean(shared || development || connected),
			shared_openrouter: Boolean(shared || development),
			providers,
		},
	};
}

export async function reserveShared(
	db: DatabaseOrTx,
	userId: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
	await checkRateLimit(db, `shared-ai/user/${userId}`, 3);
	await checkRateLimit(db, "shared-ai/minute", 20);
	await checkRateLimit(db, "shared-ai/day", dailySharedLimit(env), 86400);
}
