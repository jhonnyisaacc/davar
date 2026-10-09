import { sql } from "drizzle-orm";
import { createApp } from "../src/http/app.js";
import type { AppDeps } from "../src/http/deps.js";
import { createDb, type DbHandle } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import type { ServerConfig } from "../src/lib/config.js";
import { DEFAULT_TRUSTED_PROXIES } from "../src/services/remoteIp.js";
import { enc, encJson } from "../src/services/fields.js";
import { FLAG_KEYS, type FlagSet } from "../src/services/flags.js";
import { issueSession } from "../src/services/sessions.js";
import type { SentMail } from "../src/services/mailer.js";

export const TEST_DATABASE_URL = (() => {
	const url = process.env.TEST_DATABASE_URL;
	if (!url) {
		throw new Error(
			"TEST_DATABASE_URL is required (e.g. postgresql://<user>:<pass>@127.0.0.1:5432/davar_server_test). " +
				"Create the database, run `bun run db:migrate` with DATABASE_URL set, then re-run the tests.",
		);
	}
	return url;
})();

let handle: DbHandle | null = null;

export function testDb(): DbHandle {
	if (!handle) handle = createDb(TEST_DATABASE_URL);
	return handle;
}

const TABLES = [
	"rate_limits",
	"handoffs",
	"auth_attempts",
	"sessions",
	"identities",
	"messages",
	"conversations",
	"provider_connections",
	"memberships",
	"endorsements",
	"notifications",
	"assemblies",
	"articles",
	"month_confirmations",
	"new_moon_observations",
	"calendar_source_entries",
	"calendar_feed_states",
	"access_codes",
	"users",
];

export async function truncateAll(): Promise<void> {
	const { sql: client } = testDb();
	await client.unsafe(`TRUNCATE ${TABLES.join(", ")} CASCADE`);
}

export function testConfig(): ServerConfig {
	return {
		env: "test",
		databaseUrl: TEST_DATABASE_URL,
		apiPublicUrl: "http://localhost:3000",
		authReturnUris: ["davar://auth/callback"],
		webOrigins: [],
		trustedProxies: [...DEFAULT_TRUSTED_PROXIES],
		encryptionPreviousKeys: [],
		sandbox: false,
		encryptionPrimaryKey: "test-primary-key-for-davar-server-only-0001",
		encryptionDeterministicKey: "test-deterministic-key-davar-only-0001",
		allowedHosts: [],
		poolSize: 10,
		port: 3000,
	};
}

export function testEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
	return {
		...process.env,
		NODE_ENV: "test",
		API_PUBLIC_URL: "http://localhost:3000",
		AUTH_RETURN_URIS: "davar://auth/callback",
		...extra,
	} as NodeJS.ProcessEnv;
}

export interface TestContext {
	deps: AppDeps;
	outbox: SentMail[];
	app: ReturnType<typeof createApp>;
}

export const OPEN_FLAGS: FlagSet = Object.fromEntries(
	FLAG_KEYS.map((key) => [key, true]),
) as FlagSet;

export function makeTestContext(overrides: Partial<AppDeps> = {}): TestContext {
	const outbox: SentMail[] = [];
	const deps: AppDeps = {
		db: testDb().db,
		config: testConfig(),
		env: testEnv(),
		outbox,
		rootDir: process.cwd(),
		// Product fully rolled out unless a test says otherwise.
		flags: { ...OPEN_FLAGS },
		...overrides,
	};
	return { deps, outbox, app: createApp(deps) };
}

export const READER_PROFILE = {
	experience: "experienced",
	city: "Buenos Aires",
	latitude: -34.6,
	longitude: -58.4,
	gender: "male",
	visibility_reviewed: true,
	answers: { "1": true, "2": true, "3": true, "4": true, "5": true, "6": true, "7": true },
};

export async function createUser(
	input: {
		displayName?: string;
		profile?: Record<string, unknown>;
		admittedAt?: Date | null;
		settings?: Record<string, unknown>;
		settingsVersion?: number;
		leaderVerified?: boolean;
		discoverable?: boolean;
		contactVisible?: boolean;
		freeConsultations?: number;
	} = {},
): Promise<string> {
	const config = testConfig();
	const rows = await testDb()
		.db.insert(users)
		.values({
			displayName: await enc(input.displayName ?? "Reader", config.encryptionPrimaryKey),
			profile: await encJson(input.profile ?? READER_PROFILE, config.encryptionPrimaryKey),
			admittedAt: input.admittedAt === undefined ? new Date() : input.admittedAt,
			settings: input.settings ?? {},
			settingsVersion: input.settingsVersion ?? 0,
			leaderVerified: input.leaderVerified ?? false,
			discoverable: input.discoverable ?? false,
			contactVisible: input.contactVisible ?? false,
			freeConsultations: input.freeConsultations ?? 0,
		})
		.returning({ id: users.id });
	const row = rows[0];
	if (!row) throw new Error("User insert failed");
	return row.id;
}

export async function authHeaders(userId: string): Promise<Record<string, string>> {
	const session = await issueSession(testDb().db, userId);
	return { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };
}

export async function json<T>(response: Response): Promise<{ status: number; body: T }> {
	const text = await response.text();
	let body: T;
	try {
		body = JSON.parse(text) as T;
	} catch {
		body = text as unknown as T;
	}
	return { status: response.status, body };
}

export function cacheControl(response: Response): string | null {
	return response.headers.get("Cache-Control");
}

export async function seedFeedState(
	status: string = "ok",
	lastSuccessAt: Date | null = new Date(),
): Promise<void> {
	const { calendarFeedStates } = await import("../src/db/schema.js");
	const { FEED_SOURCE } = await import("../src/services/feedState.js");
	const db = testDb().db;
	const { eq } = await import("drizzle-orm");
	const existing = await db
		.select({ id: calendarFeedStates.id })
		.from(calendarFeedStates)
		.where(eq(calendarFeedStates.source, FEED_SOURCE))
		.limit(1);
	if (existing[0]) {
		await db
			.update(calendarFeedStates)
			.set({ status, lastAttemptAt: new Date(), lastSuccessAt, updatedAt: new Date() })
			.where(eq(calendarFeedStates.id, existing[0].id));
	} else {
		await db.insert(calendarFeedStates).values({
			source: FEED_SOURCE,
			status,
			lastAttemptAt: new Date(),
			lastSuccessAt,
		});
	}
}
