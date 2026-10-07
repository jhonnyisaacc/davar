import type { DatabaseOrTx } from "../db/client.js";
import type { ServerConfig } from "../lib/config.js";
import type { SentMail } from "../services/mailer.js";
import type { ProviderHttp } from "../services/oauth.js";

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
}

export type AppVariables = {
	deps: AppDeps;
};
