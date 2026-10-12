import type { DatabaseOrTx } from "../db/client.js";
import type { ServerConfig } from "../lib/config.js";
import type { SentMail } from "../services/mailer.js";
import type { ProviderHttp } from "../services/oauth.js";
import type { FlagSet } from "../services/flags.js";

export interface GeneratorInput {
	provider: string;
	credential: string;
	model: string;
	system: string;
	messages: Array<{ role: string; content: string }>;
}

export interface AppDeps {
	db: DatabaseOrTx;
	config: ServerConfig;
	env: NodeJS.ProcessEnv;
	http?: ProviderHttp;
	generator?: (input: GeneratorInput) => Promise<string>;
	outbox?: SentMail[];
	rootDir?: string;
	/** Test seam mirroring stubbed FeatureFlags in Rails tests. */
	flags?: FlagSet | null;
	/** Test seam for the remote address (see clientIp). */
	remoteAddr?: string;
}

export type AppVariables = {
	deps: AppDeps;
};
