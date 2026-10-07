import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import {
	clearLogs,
	helpText,
	LOCAL_DATABASE_URL,
	localDatabaseTarget,
	main,
	parseSetupArgs,
	setupPlan,
} from "../src/setup.js";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));

function spawnSetup(args: string[], databaseUrl: string | undefined) {
	const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development" };
	if (databaseUrl === undefined) delete env.DATABASE_URL;
	else env.DATABASE_URL = databaseUrl;
	return Bun.spawnSync(["bun", "./src/setup.ts", ...args], {
		cwd: SERVER_ROOT,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
}

describe("local setup", () => {
	test("help lists install, database, reset, logs, and the server", async () => {
		const hosted = "postgresql://davar:super-secret-value@db.example.com/davar";
		const result = spawnSetup(["--help"], hosted);
		expect(result.exitCode).toBe(0);
		const text = result.stdout.toString();
		expect(text).toContain("Install server dependencies");
		expect(text).toContain("local development database");
		expect(text).toContain("--reset");
		expect(text).toContain("clear logs");
		expect(text).toContain("start the server");
		expect(text).not.toContain("super-secret-value");
		expect(result.stderr.toString()).not.toContain("super-secret-value");
		expect(helpText()).toBe(text.trim());
	});

	test("dry-run prints the local steps and does not connect", () => {
		const result = spawnSetup(["--dry-run"], undefined);
		expect(result.exitCode).toBe(0);
		const text = result.stdout.toString();
		expect(text).toContain("== Installing dependencies ==");
		expect(text).toContain("bun install --frozen-lockfile");
		expect(text).toContain("== Preparing database ==");
		expect(text).toContain("127.0.0.1:5432/davar_v2_development");
		expect(text).toContain("== Removing old logs ==");
		expect(text).toContain("== Starting development server ==");
		expect(text).toContain("bun run dev");
		expect(text).not.toContain("local-development-only");
		expect(text).not.toContain("docker");
		expect(result.stderr.toString()).toBe("");
	});

	test("dry-run reset can skip the server", () => {
		const result = spawnSetup(["--dry-run", "--reset", "--skip-server"], "");
		expect(result.exitCode).toBe(0);
		const text = result.stdout.toString();
		expect(text).toContain("== Resetting database ==");
		expect(text).toContain("127.0.0.1:5432/davar_v2_development");
		expect(text).not.toContain("== Starting development server ==");
		expect(text).not.toContain("local-development-only");
	});

	test("a hosted database is refused before any step runs", () => {
		const result = spawnSetup(
			["--dry-run"],
			"postgresql://davar:super-secret-value@db.example.com:5432/davar_v2_development",
		);
		expect(result.exitCode).toBe(1);
		const error = result.stderr.toString();
		expect(error).toContain("Refuses a non-local database host: db.example.com");
		expect(error).not.toContain("super-secret-value");
		expect(result.stdout.toString()).not.toContain("Installing dependencies");
	});

	test("the shell command prints help", () => {
		const result = Bun.spawnSync(["bash", "./bin/setup", "--help"], {
			cwd: SERVER_ROOT,
			env: { ...process.env, DATABASE_URL: "", NODE_ENV: "development" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("--dry-run");
	});

	test("defaults to the compose database on 127.0.0.1:5432", () => {
		expect(localDatabaseTarget(undefined)).toEqual({
			url: LOCAL_DATABASE_URL,
			host: "127.0.0.1",
			port: 5432,
			name: "davar_v2_development",
		});
		expect(localDatabaseTarget("  ")).toEqual(localDatabaseTarget(undefined));
		expect(localDatabaseTarget("postgresql://davar@[::1]/davar_v2_development")).toMatchObject({
			host: "::1",
			port: 5432,
			name: "davar_v2_development",
		});
	});

	test("refuses a hosted host, the maintenance database, and an unknown flag", () => {
		expect(() =>
			localDatabaseTarget("postgresql://davar:secret@db.example.org/davar_v2_development"),
		).toThrow("Refuses a non-local database host: db.example.org");
		expect(() => localDatabaseTarget("postgresql://davar@127.0.0.1:5432/postgres")).toThrow(
			"Refuses a database name",
		);
		expect(() => parseSetupArgs(["--migrate"])).toThrow("Unknown argument: --migrate");
	});

	test("plan keeps dev as the server start", () => {
		const target = localDatabaseTarget(undefined);
		const plan = setupPlan(
			{ reset: true, skipServer: false, dryRun: true, help: false },
			target,
		);
		expect(plan).toContain("bun run dev");
		expect(plan).not.toContain("bun run start");
	});

	test("clearLogs truncates log files and leaves other files", async () => {
		const dir = await mkdtemp(join(tmpdir(), "davar-setup-logs-"));
		await writeFile(join(dir, "development.log"), "old line\n");
		await writeFile(join(dir, "notes.txt"), "keep");
		await clearLogs(dir);
		expect(await readFile(join(dir, "development.log"), "utf8")).toBe("");
		expect(await readFile(join(dir, "notes.txt"), "utf8")).toBe("keep");
		await clearLogs(join(dir, "missing"));
	});

	test("main dry-run does not need a database", async () => {
		const lines: string[] = [];
		const code = await main(["--dry-run", "--skip-server"], { NODE_ENV: "development" }, {
			log: (line) => lines.push(line),
			error: (line) => lines.push(line),
		});
		expect(code).toBe(0);
		expect(lines.join("\n")).toContain("127.0.0.1:5432/davar_v2_development");
	});

	test("compose is Postgres 17 on loopback and package scripts stay put", async () => {
		const compose = await readFile(join(SERVER_ROOT, "compose.yml"), "utf8");
		expect(compose).toContain("image: postgres:17");
		expect(compose).toContain("127.0.0.1:5432:5432");
		expect(compose).toContain("POSTGRES_DB: davar_v2_development");
		expect(compose).toContain("POSTGRES_USER: davar");
		expect(compose).not.toContain("amazonaws");
		expect(compose).not.toContain("supabase");
		expect(compose).not.toContain("neon.tech");
		const pkg = await Bun.file(join(SERVER_ROOT, "package.json")).json();
		expect(pkg.scripts.dev).toBe("bun --env-file=.env ./src/index.ts");
		expect(pkg.scripts.start).toBe("bun --env-file=.env ./src/index.ts");
		expect(pkg.scripts.setup).toBe("bun ./src/setup.ts");
	});
});
