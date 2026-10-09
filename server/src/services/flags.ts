import { sha256Hex } from "../lib/crypto.js";
import { DomainError } from "../lib/errors.js";
import type { ProviderHttp } from "./oauth.js";
import { fetchHttp } from "./oauth.js";

export const FLAG_KEYS = [
	"ai_provider_connections",
	"ai_shared_openrouter",
	"assemblies",
	"commentary",
	"account_sign_in",
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];

export type FlagSet = Record<FlagKey, boolean>;

const FLAG_REQUIRES: Partial<Record<FlagKey, FlagKey>> = {
	ai_provider_connections: "commentary",
	ai_shared_openrouter: "commentary",
};

function flagSet(read: (key: FlagKey) => boolean): FlagSet {
	const flags = {} as FlagSet;
	for (const key of FLAG_KEYS) flags[key] = read(key) === true;
	for (const key of FLAG_KEYS) {
		const parent = FLAG_REQUIRES[key];
		if (parent !== undefined && flags[parent] !== true) flags[key] = false;
	}
	return flags;
}

export const CLOSED_FLAGS: FlagSet = flagSet(() => false);

const ALLOWED_HOSTS = new Set(["https://us.i.posthog.com", "https://eu.i.posthog.com"]);

interface CacheEntry {
	expires: number;
	value: FlagSet;
}

const flagCache = new Map<string, CacheEntry>();

export function clearFlagCache(): void {
	flagCache.clear();
}

export interface FlagsDeps {
	env?: NodeJS.ProcessEnv;
	http?: ProviderHttp;
	/** Test seam mirroring stubbed FeatureFlags in Rails tests. */
	flags?: FlagSet | null;
}

export async function evaluateFlags(
	userId: string | null,
	deps: FlagsDeps = {},
): Promise<FlagSet> {
	const stub = deps.flags;
	if (stub) return flagSet((key) => stub[key] === true);
	const env = deps.env ?? process.env;
	const token = (env.POSTHOG_PROJECT_TOKEN ?? "").trim();
	if (!token) return { ...CLOSED_FLAGS };
	const host = env.POSTHOG_HOST ?? "https://us.i.posthog.com";
	if (!ALLOWED_HOSTS.has(host)) return { ...CLOSED_FLAGS };
	const nodeEnv = env.NODE_ENV ?? "development";
	const distinctId = `davar/${userId ?? "anonymous"}`;
	const cacheKey = `davar/flags/${await sha256Hex(token)}/${nodeEnv}/${distinctId}`;
	const cached = flagCache.get(cacheKey);
	if (cached && cached.expires > Date.now()) return { ...cached.value };
	try {
		const http = deps.http ?? fetchHttp;
		const payload = (await http.json(`${host}/flags?v=2`, {
			method: "post",
			body: {
				api_key: token,
				distinct_id: distinctId,
				person_properties: { environment: nodeEnv },
				flag_keys_to_evaluate: [...FLAG_KEYS],
				disable_geoip: true,
			},
			openTimeoutMs: 2000,
			readTimeoutMs: 3000,
		})) as {
			flags?: Record<string, { enabled?: boolean }>;
			errorsWhileComputingFlags?: unknown;
			quotaLimited?: unknown;
		};
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
			throw new DomainError("flags_unavailable", 503);
		}
		if (
			payload.errorsWhileComputingFlags ||
			(Array.isArray(payload.quotaLimited) && payload.quotaLimited.includes("feature_flags"))
		) {
			throw new DomainError("flags_unavailable", 503);
		}
		const reported = payload.flags;
		const result = flagSet((key) => reported?.[key]?.enabled === true);
		flagCache.set(cacheKey, { expires: Date.now() + 30 * 1000, value: result });
		return { ...result };
	} catch {
		return { ...CLOSED_FLAGS };
	}
}

export async function requireFlag(
	key: FlagKey,
	userId: string | null,
	deps: FlagsDeps = {},
): Promise<void> {
	const flags = await evaluateFlags(userId, deps);
	if (!flags[key]) throw new DomainError("feature_unavailable", 503);
}
