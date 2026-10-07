import { readdir, stat, truncate } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

export const LOCAL_DATABASE_URL =
	"postgresql://davar:local-development-only@127.0.0.1:5432/davar_v2_development";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));

export interface SetupOptions {
	reset: boolean;
	skipServer: boolean;
	dryRun: boolean;
	help: boolean;
}

export interface DatabaseTarget {
	url: string;
	host: string;
	port: number;
	name: string;
}

export interface SetupIo {
	log: (line: string) => void;
	error: (line: string) => void;
}

export function parseSetupArgs(argv: string[]): SetupOptions {
	const options: SetupOptions = {
		reset: false,
		skipServer: false,
		dryRun: false,
		help: false,
	};
	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") options.help = true;
		else if (arg === "--reset") options.reset = true;
		else if (arg === "--skip-server") options.skipServer = true;
		else if (arg === "--dry-run") options.dryRun = true;
		else throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

export function helpText(): string {
	return [
		"Usage: bin/setup [--reset] [--skip-server] [--dry-run] [--help]",
		"",
		"Install server dependencies, prepare the local development database,",
		"clear logs, and start the server.",
		"",
		"--reset        drop and recreate the local database after prepare",
		"--skip-server  do not start the server",
		"--dry-run      print the steps without running them",
		"--help         show this help",
	].join("\n");
}

export function localDatabaseTarget(raw: string | undefined): DatabaseTarget {
	const urlText = raw && raw.trim() !== "" ? raw.trim() : LOCAL_DATABASE_URL;
	let url: URL;
	try {
		url = new URL(urlText);
	} catch {
		throw new Error("DATABASE_URL is not a valid URL");
	}
	if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
		throw new Error("DATABASE_URL must use postgresql");
	}
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (!LOCAL_HOSTS.has(host)) {
		throw new Error(`Refuses a non-local database host: ${host || "(missing)"}`);
	}
	const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name === "postgres") {
		throw new Error("Refuses a database name that is not a local application database");
	}
	const port = url.port === "" ? 5432 : Number(url.port);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error("DATABASE_URL port is not valid");
	}
	return { url: urlText, host, port, name };
}

export function setupPlan(options: SetupOptions, target: DatabaseTarget): string[] {
	const where = `${target.host}:${target.port}/${target.name}`;
	const lines = [
		"== Installing dependencies ==",
		"bun install --frozen-lockfile",
		"== Preparing database ==",
		where,
	];
	if (options.reset) {
		lines.push("== Resetting database ==", where);
	}
	lines.push("== Removing old logs ==", "log");
	if (!options.skipServer) {
		lines.push("== Starting development server ==", "bun run dev");
	}
	return lines;
}

export async function clearLogs(logDir: string): Promise<void> {
	let names: string[];
	try {
		names = await readdir(logDir);
	} catch (error) {
		if (isEnoent(error)) return;
		throw error;
	}
	for (const name of names) {
		if (!name.endsWith(".log")) continue;
		const path = join(logDir, name);
		const info = await stat(path);
		if (!info.isFile()) continue;
		await truncate(path, 0);
	}
}

export async function main(
	argv: string[],
	env: NodeJS.ProcessEnv,
	io: SetupIo,
): Promise<number> {
	let options: SetupOptions;
	try {
		options = parseSetupArgs(argv);
	} catch (error) {
		io.error(error instanceof Error ? error.message : String(error));
		io.error(helpText());
		return 1;
	}
	if (options.help) {
		io.log(helpText());
		return 0;
	}
	let target: DatabaseTarget;
	try {
		target = localDatabaseTarget(env.DATABASE_URL);
	} catch (error) {
		io.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
	if (options.dryRun) {
		io.log(setupPlan(options, target).join("\n"));
		return 0;
	}
	return executeSetup(options, target, env, io);
}

async function executeSetup(
	options: SetupOptions,
	target: DatabaseTarget,
	env: NodeJS.ProcessEnv,
	io: SetupIo,
): Promise<number> {
	const name = env.NODE_ENV ?? "development";
	if (name === "staging" || name === "production") {
		io.error(`setup runs in development, not ${name}`);
		return 1;
	}
	try {
		io.log("== Installing dependencies ==");
		await runCommand(["bun", "install", "--frozen-lockfile"], env);
		io.log("== Preparing database ==");
		io.log(`${target.host}:${target.port}/${target.name}`);
		await ensureDatabase(target);
		await migrate(target.url, env);
		if (options.reset) {
			io.log("== Resetting database ==");
			io.log(`${target.host}:${target.port}/${target.name}`);
			await recreateDatabase(target);
			await migrate(target.url, env);
		}
		io.log("== Removing old logs ==");
		await clearLogs(join(SERVER_ROOT, "log"));
		if (options.skipServer) return 0;
		io.log("== Starting development server ==");
		const proc = Bun.spawn(["bun", "run", "dev"], {
			cwd: SERVER_ROOT,
			env: { ...env, DATABASE_URL: target.url },
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		return await proc.exited;
	} catch (error) {
		io.error(redact(error instanceof Error ? error.message : String(error), target));
		return 1;
	}
}

async function ensureDatabase(target: DatabaseTarget): Promise<void> {
	await withAdmin(target.url, async (sql) => {
		const found = await sql`SELECT 1 FROM pg_database WHERE datname = ${target.name}`;
		if (found.length === 0) {
			await sql.unsafe(`CREATE DATABASE "${target.name}"`);
		}
	});
}

async function recreateDatabase(target: DatabaseTarget): Promise<void> {
	await withAdmin(target.url, async (sql) => {
		await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${target.name} AND pid <> pg_backend_pid()`;
		await sql.unsafe(`DROP DATABASE IF EXISTS "${target.name}"`);
		await sql.unsafe(`CREATE DATABASE "${target.name}"`);
	});
}

async function withAdmin(
	databaseUrl: string,
	fn: (sql: postgres.Sql) => Promise<void>,
): Promise<void> {
	const url = new URL(databaseUrl);
	const sql = postgres({
		host: url.hostname.replace(/^\[|\]$/g, ""),
		port: Number(url.port || 5432),
		username: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		database: "postgres",
		max: 1,
	});
	try {
		await fn(sql);
	} finally {
		await sql.end();
	}
}

async function migrate(databaseUrl: string, env: NodeJS.ProcessEnv): Promise<void> {
	await runCommand(["bun", "./src/db/migrate.ts"], {
		...env,
		DATABASE_URL: databaseUrl,
	});
}

async function runCommand(command: string[], env: NodeJS.ProcessEnv): Promise<void> {
	const proc = Bun.spawn(command, {
		cwd: SERVER_ROOT,
		env,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(`${command.join(" ")} exited ${code}`);
	}
}

function redact(text: string, target: DatabaseTarget): string {
	const shown = `${target.host}:${target.port}/${target.name}`;
	let out = text.split(target.url).join(shown);
	try {
		const password = decodeURIComponent(new URL(target.url).password);
		if (password) out = out.split(password).join("[redacted]");
	} catch {
		return out;
	}
	return out;
}

function isEnoent(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "ENOENT"
	);
}

if (import.meta.main) {
	const code = await main(process.argv.slice(2), process.env, {
		log: (line) => console.log(line),
		error: (line) => console.error(line),
	});
	process.exit(code);
}
