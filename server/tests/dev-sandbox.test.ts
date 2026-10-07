import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { LOCAL_DATABASE_URL } from "../src/setup.js";
import {
	bunBin,
	defaultPaths,
	helpText,
	main,
	parseProcessEntries,
	parseSandboxArgs,
	postgresPort,
	processSignature,
	resolveBasePython,
	sandboxChildEnv,
	sandboxDatabaseUrl,
	serviceEnv,
	setupPlan,
	signalProcessGroup,
	startCommands,
	startPlan,
	stopServices,
	stopTargets,
	type SandboxDeps,
	type SandboxIo,
} from "../src/dev-sandbox.js";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PATHS = defaultPaths(SERVER_ROOT);

function linesOf(io: { lines: string[] }): SandboxIo {
	return {
		log: (line) => io.lines.push(line),
		error: (line) => io.lines.push(line),
	};
}

function throwingDeps(): SandboxDeps {
	const fail = (): never => {
		throw new Error("dry-run called a real step");
	};
	return {
		connect: async () => fail(),
		run: async () => fail(),
		spawnGroup: () => fail(),
		signatureOf: () => fail(),
		signalGroup: () => fail(),
		exists: () => fail(),
	};
}

function dryEnv(home: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") env[key] = value;
	}
	env.NODE_ENV = "development";
	env.HOME = home;
	env.PGPORT = "5432";
	env.BUN_BIN = "bun";
	delete env.PYTHON_BIN;
	return env;
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCode(error) === "EPERM";
	}
}

function errorCode(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "code" in error) {
		const code = (error as { code?: unknown }).code;
		return typeof code === "string" ? code : undefined;
	}
	return undefined;
}

describe("sandbox lifecycle", () => {
	test("setup dry-run prints the local steps and does not run them", async () => {
		const home = mkdtempSync(join(tmpdir(), "davar-sandbox-home-"));
		const captured = { lines: [] as string[] };
		const code = await main(
			["setup", "--dry-run"],
			dryEnv(home),
			linesOf(captured),
			PATHS,
			throwingDeps(),
		);
		expect(code).toBe(0);
		const text = captured.lines.join("\n");
		expect(text).toBe(
			setupPlan({ bun: "bun", python: "python3", port: 5432 }).join("\n"),
		);
		expect(text).toContain("bun install --frozen-lockfile");
		expect(text).toContain("python3 -m venv tmp/sandbox/venv");
		expect(text).toContain("pip install -r api/requirements.txt");
		expect(text).toContain("bin/setup --skip-server");
		expect(text).toContain("127.0.0.1:5432/davar_v2_sandbox");
		expect(text).toContain("bun run sandbox:seed");
		expect(text).toContain("bun run jobs:calendar");
		expect(text).toContain("bun ./build.ts");
		expect(text).not.toContain("bundle");
		expect(text).not.toContain("gem");
		expect(text).not.toContain("rails");
		expect(text).not.toContain(new URL(LOCAL_DATABASE_URL).password);
	});

	test("start dry-run prints the checks and commands and does not spawn", async () => {
		const home = mkdtempSync(join(tmpdir(), "davar-sandbox-home-"));
		const captured = { lines: [] as string[] };
		const code = await main(
			["--dry-run", "start"],
			dryEnv(home),
			linesOf(captured),
			PATHS,
			throwingDeps(),
		);
		expect(code).toBe(0);
		const plan = startPlan({ bun: "bun", port: 5432, stateDir: PATHS.stateDir });
		expect(captured.lines.join("\n")).toBe(plan.join("\n"));
		expect(plan).toEqual(expect.arrayContaining(["3000", "5173", "5174", "8081"]));
		expect(plan).toContain("bun run dev");
		expect(plan).toContain("bun run start --dev-client --port 8081");
		expect(plan.join("\n")).toContain("PostgreSQL remains running.");
		expect(startCommands("bun").map((service) => service.service)).toEqual([
			"api",
			"web",
			"mobile",
		]);
	});

	test("stop dry-run names only a matching process group", async () => {
		const dir = mkdtempSync(join(tmpdir(), "davar-sandbox-state-"));
		writeFileSync(
			join(dir, "processes.json"),
			JSON.stringify([
				{ pid: 4242, signature: "same", service: "api" },
				{ pid: 4243, signature: "stale", service: "web" },
				{ pid: 1, signature: "init", service: "mobile" },
			]),
		);
		const signaled: number[] = [];
		const captured = { lines: [] as string[] };
		const deps = throwingDeps();
		deps.signatureOf = (pid) => {
			if (pid === 4242) return "same";
			if (pid === 1) return "init";
			return "other";
		};
		deps.signalGroup = (pid) => signaled.push(pid);
		const code = await main(
			["stop", "--dry-run"],
			{ NODE_ENV: "development" },
			linesOf(captured),
			{ ...PATHS, stateDir: dir },
			deps,
		);
		expect(code).toBe(0);
		expect(signaled).toEqual([]);
		const text = captured.lines.join("\n");
		expect(text).toContain("PostgreSQL remains running.");
		expect(text).toContain("TERM process group 4242");
		expect(text).not.toContain("TERM process group 4243");
		expect(text).not.toContain("TERM process group 1");
		expect(readFileSync(join(dir, "processes.json"), "utf8")).toContain("4243");
	});

	test("stop signals the matching process group and leaves another process", async () => {
		const dir = mkdtempSync(join(tmpdir(), "davar-sandbox-stop-"));
		const keep = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
		const drop = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const dropPid = drop.pid;
			const keepPid = keep.pid;
			if (dropPid === undefined || keepPid === undefined) throw new Error("sleep did not start");
			const signature = processSignature(dropPid);
			expect(signature).not.toBeNull();
			writeFileSync(
				join(dir, "processes.json"),
				JSON.stringify([
					{ pid: dropPid, signature, service: "api" },
					{ pid: keepPid, signature: "not-this-process", service: "web" },
					{ pid: 1, signature: processSignature(1) ?? "init", service: "mobile" },
				]),
			);
			const exited = new Promise((resolve) => drop.once("exit", resolve));
			const signaled = stopServices({
				stateDir: dir,
				signatureOf: processSignature,
				signalGroup: signalProcessGroup,
			});
			const timeout = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("matching process was not stopped")), 2000);
			});
			await Promise.race([exited, timeout]);
			expect(signaled).toEqual([dropPid]);
			expect(alive(keepPid)).toBe(true);
			expect(alive(1)).toBe(true);
			expect(alive(dropPid)).toBe(false);
		} finally {
			if (timer) clearTimeout(timer);
			for (const child of [keep, drop]) {
				if (!child.pid) continue;
				try {
					process.kill(-child.pid, "SIGTERM");
				} catch {
					/* already gone */
				}
			}
		}
	});

	test("a stale signature and a corrupt process file do not signal", () => {
		const dir = mkdtempSync(join(tmpdir(), "davar-sandbox-stale-"));
		const sleep = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
		const signaled: number[] = [];
		try {
			writeFileSync(
				join(dir, "processes.json"),
				JSON.stringify([{ pid: sleep.pid, signature: "stale", service: "api" }]),
			);
			expect(
				stopServices({
					stateDir: dir,
					signatureOf: processSignature,
					signalGroup: (pid) => signaled.push(pid),
				}),
			).toEqual([]);
			expect(signaled).toEqual([]);
			if (sleep.pid === undefined) throw new Error("sleep did not start");
			expect(alive(sleep.pid)).toBe(true);
			writeFileSync(join(dir, "processes.json"), "{");
			expect(() =>
				stopServices({
					stateDir: dir,
					signatureOf: () => "x",
					signalGroup: (pid) => signaled.push(pid),
				}),
			).toThrow();
			expect(signaled).toEqual([]);
			expect(readFileSync(join(dir, "processes.json"), "utf8")).toBe("{");
		} finally {
			if (sleep.pid) {
				try {
					process.kill(-sleep.pid, "SIGTERM");
				} catch {
					/* already gone */
				}
			}
		}
	});

	test("stop targets skip pid 1, this process, and a signature mismatch", () => {
		const targets = stopTargets(
			[
				{ pid: 1, signature: "init", service: "api" },
				{ pid: process.pid, signature: "self", service: "web" },
				{ pid: 77, signature: "match", service: "mobile" },
				{ pid: 78, signature: "stale", service: "api" },
				{ pid: 79, signature: null, service: "web" },
			],
			(pid) => {
				if (pid === 1) return "init";
				if (pid === process.pid) return "self";
				if (pid === 77) return "match";
				return "other";
			},
		);
		expect(targets).toEqual([77]);
		expect(parseProcessEntries('[{"pid":77,"signature":" match ","service":"api"}]')).toEqual([
			{ pid: 77, signature: "match", service: "api" },
		]);
	});

	test("the sandbox database is local and the child env does not keep a hosted url", () => {
		const url = new URL(sandboxDatabaseUrl(5433));
		const local = new URL(LOCAL_DATABASE_URL);
		expect(url.username).toBe(local.username);
		expect(url.password).toBe(local.password);
		expect(url.hostname).toBe("127.0.0.1");
		expect(url.port).toBe("5433");
		expect(url.pathname).toBe("/davar_v2_sandbox");
		const child = sandboxChildEnv(
			{
				DATABASE_URL: "postgresql://davar:super-secret-value@db.example.com/davar",
				PORT: "4000",
				NODE_ENV: "test",
			},
			PATHS,
			5432,
		);
		expect(child.DATABASE_URL).not.toContain("super-secret-value");
		expect(child.DATABASE_URL).toContain("/davar_v2_sandbox");
		expect(child.NODE_ENV).toBe("development");
		expect(child.DAVAR_DEV_SANDBOX).toBe("1");
		expect(child.PORT).toBeUndefined();
		expect(child.PYTHON_BIN).toBe(join(PATHS.stateDir, "venv/bin/python"));
		const api = serviceEnv({ PORT: "4000" }, PATHS, 5432, "api");
		const web = serviceEnv({ PORT: "4000" }, PATHS, 5432, "web");
		expect(api.PORT).toBe("3000");
		expect(api.CI).toBe("1");
		expect(web.PORT).toBeUndefined();
		expect(web.CI).toBe("1");
		expect(web.HOST).toBe("127.0.0.1");
	});

	test("hosted environments and unknown commands fail before any step", async () => {
		const captured = { lines: [] as string[] };
		const hosted = await main(
			["setup", "--dry-run"],
			{ NODE_ENV: "production", DATABASE_URL: "postgresql://davar:super-secret-value@db.example.com/davar" },
			linesOf(captured),
			PATHS,
			throwingDeps(),
		);
		expect(hosted).toBe(1);
		expect(captured.lines.join("\n")).toContain("dev-sandbox runs in development, not production");
		expect(captured.lines.join("\n")).not.toContain("super-secret-value");
		expect(captured.lines.join("\n")).not.toContain("Installing web");
		captured.lines.length = 0;
		const ios = await main(["ios"], { NODE_ENV: "development" }, linesOf(captured), PATHS, throwingDeps());
		expect(ios).toBe(1);
		expect(captured.lines.join("\n")).toContain("Unknown argument: ios");
		expect(captured.lines.join("\n")).toContain("setup|start|stop");
		expect(() => parseSandboxArgs(["--reset"])).toThrow("Unknown argument: --reset");
		expect(() => postgresPort({ PGPORT: "nope" })).toThrow("PGPORT is not valid");
		expect(postgresPort({})).toBe(5432);
		expect(bunBin({})).toBe("bun");
		const home = mkdtempSync(join(tmpdir(), "davar-sandbox-empty-home-"));
		expect(resolveBasePython({ HOME: home })).toBe("python3");
		expect(helpText()).toContain("--dry-run");
	});

	test("the shell dry-run does not start services or kill an unrelated process", () => {
		const home = mkdtempSync(join(tmpdir(), "davar-sandbox-shell-"));
		const sleep = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
		try {
			const env = dryEnv(home);
			const setup = spawnSync("bash", ["./bin/dev-sandbox", "setup", "--dry-run"], {
				cwd: SERVER_ROOT,
				env,
				encoding: "utf8",
			});
			const start = spawnSync("bash", ["./bin/dev-sandbox", "--dry-run", "start"], {
				cwd: SERVER_ROOT,
				env,
				encoding: "utf8",
			});
			const stop = spawnSync("bash", ["./bin/dev-sandbox", "stop", "--dry-run"], {
				cwd: SERVER_ROOT,
				env,
				encoding: "utf8",
			});
			const ios = spawnSync("bash", ["./bin/dev-sandbox", "ios"], {
				cwd: SERVER_ROOT,
				env,
				encoding: "utf8",
			});
			expect(setup.status).toBe(0);
			expect(setup.stdout.trim()).toBe(
				setupPlan({ bun: "bun", python: "python3", port: 5432 }).join("\n"),
			);
			expect(setup.stderr).toBe("");
			expect(start.status).toBe(0);
			expect(start.stdout.trim()).toBe(
				startPlan({ bun: "bun", port: 5432, stateDir: PATHS.stateDir }).join("\n"),
			);
			expect(start.stderr).toBe("");
			expect(stop.status).toBe(0);
			expect(stop.stdout).toContain("PostgreSQL remains running.");
			expect(ios.status).toBe(1);
			expect(ios.stderr).toContain("Unknown argument: ios");
			if (sleep.pid === undefined) throw new Error("sleep did not start");
			expect(alive(sleep.pid)).toBe(true);
		} finally {
			if (sleep.pid) {
				try {
					process.kill(-sleep.pid, "SIGTERM");
				} catch {
					/* already gone */
				}
			}
		}
	});

	test("setup, dev, start, and compose stay as they are", () => {
		const pkg = JSON.parse(readFileSync(join(SERVER_ROOT, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts.dev).toBe("bun --env-file=.env ./src/index.ts");
		expect(pkg.scripts.start).toBe("bun --env-file=.env ./src/index.ts");
		expect(pkg.scripts.setup).toBe("bun ./src/setup.ts");
		const compose = readFileSync(join(SERVER_ROOT, "compose.yml"), "utf8");
		expect(compose).toContain("POSTGRES_DB: davar_v2_development");
		expect(compose).toContain("127.0.0.1:5432:5432");
	});
});
