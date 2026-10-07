import { spawn, spawnSync } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { connect as connectSocket } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_DATABASE_URL } from "./setup.js";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const SANDBOX_PORTS = [3000, 5173, 5174, 8081] as const;

const WEB_ORIGINS = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:8081",
	"http://127.0.0.1:8081",
].join(",");

const AUTH_RETURN_URIS = [
	"davar://auth/callback",
	"http://localhost:5173/assemblies",
	"http://localhost:5173/commentary",
	"http://127.0.0.1:5173/assemblies",
	"http://127.0.0.1:5173/commentary",
	"http://localhost:8081/auth/callback",
	"http://127.0.0.1:8081/auth/callback",
].join(",");

export type Command = [string, ...string[]];

export interface SandboxIo {
	log: (line: string) => void;
	error: (line: string) => void;
}

export interface SandboxPaths {
	root: string;
	serverRoot: string;
	webRoot: string;
	mobileRoot: string;
	stateDir: string;
	requirements: string;
}

export interface ProcessEntry {
	pid: number;
	signature: string | null;
	service: string;
}

export interface SpawnedGroup {
	pid: number;
	exited: Promise<number | null>;
}

export interface SandboxDeps {
	connect: (port: number) => Promise<boolean>;
	run: (command: Command, cwd: string, env: NodeJS.ProcessEnv) => Promise<void>;
	spawnGroup: (
		command: Command,
		cwd: string,
		env: NodeJS.ProcessEnv,
		logPath: string,
	) => SpawnedGroup;
	signatureOf: (pid: number) => string | null;
	signalGroup: (pid: number) => void;
	exists: (path: string) => boolean;
}

type SandboxCommand = "setup" | "start" | "stop" | "help";

interface SandboxArgs {
	command: SandboxCommand;
	dryRun: boolean;
}

export function defaultPaths(serverRoot = SERVER_ROOT): SandboxPaths {
	const root = dirname(serverRoot);
	return {
		root,
		serverRoot,
		webRoot: join(root, "web"),
		mobileRoot: join(root, "mobile"),
		stateDir: join(serverRoot, "tmp/sandbox"),
		requirements: join(root, "api/requirements.txt"),
	};
}

export function helpText(): string {
	return [
		"Usage: bin/dev-sandbox setup|start|stop [--dry-run]",
		"",
		"setup      install web and mobile, create the Python venv,",
		"           prepare the sandbox database, seed, sync the calendar, and build web",
		"start      check PostgreSQL and ports 3000, 5173, 5174, and 8081,",
		"           then start the API, web, and mobile",
		"stop       stop the API, web, and mobile process group; PostgreSQL keeps running",
		"--dry-run  print the checks and commands without running them",
	].join("\n");
}

export function parseSandboxArgs(argv: string[]): SandboxArgs {
	let command: Exclude<SandboxCommand, "help"> | null = null;
	let dryRun = false;
	let help = false;
	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") help = true;
		else if (arg === "--dry-run") dryRun = true;
		else if (arg === "setup" || arg === "start" || arg === "stop") {
			if (command) throw new Error(`Unknown argument: ${arg}`);
			command = arg;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (help) return { command: "help", dryRun: false };
	if (!command) throw new Error("Missing command");
	return { command, dryRun };
}

export function postgresPort(env: NodeJS.ProcessEnv): number {
	const raw = env.PGPORT?.trim() || "5432";
	if (!/^[0-9]+$/.test(raw)) throw new Error("PGPORT is not valid");
	const port = Number(raw);
	if (port < 1 || port > 65535) throw new Error("PGPORT is not valid");
	return port;
}

export function sandboxDatabaseUrl(port: number): string {
	const url = new URL(LOCAL_DATABASE_URL);
	url.port = String(port);
	url.pathname = "/davar_v2_sandbox";
	return url.href;
}

export function bunBin(env: NodeJS.ProcessEnv): string {
	const chosen = env.BUN_BIN?.trim();
	return chosen ? chosen : "bun";
}

export function resolveBasePython(env: NodeJS.ProcessEnv): string {
	const chosen = env.PYTHON_BIN?.trim();
	if (chosen) return chosen;
	const installs = join(env.HOME ?? "", ".local/share/mise/installs/python");
	if (!existsSync(installs)) return "python3";
	let names: string[];
	try {
		names = readdirSync(installs);
	} catch {
		return "python3";
	}
	const versions = names.filter((name) => name.startsWith("3.13.")).sort();
	const last = versions.at(-1);
	if (!last) return "python3";
	const candidate = join(installs, last, "bin/python3");
	return existsSync(candidate) ? candidate : "python3";
}

export function setupPlan(options: { bun: string; python: string; port: number }): string[] {
	const venvPython = "tmp/sandbox/venv/bin/python";
	return [
		"== Installing web dependencies ==",
		`${options.bun} install --frozen-lockfile`,
		"web",
		"== Installing mobile dependencies ==",
		`${options.bun} install --frozen-lockfile`,
		"mobile",
		"== Creating Python venv ==",
		`${options.python} -m venv tmp/sandbox/venv`,
		"== Installing Python requirements ==",
		`${venvPython} -m pip install -r api/requirements.txt`,
		"== Checking PostgreSQL ==",
		`127.0.0.1:${options.port}`,
		"== Installing server and preparing database ==",
		"bin/setup --skip-server",
		`127.0.0.1:${options.port}/davar_v2_sandbox`,
		"== Seeding sandbox ==",
		`${options.bun} run sandbox:seed`,
		"== Syncing calendar ==",
		`${options.bun} run jobs:calendar`,
		"== Building web ==",
		`${options.bun} ./build.ts`,
		"web",
	];
}

export function startCommands(bun: string): Array<{ service: string; directory: string; command: Command }> {
	return [
		{ service: "api", directory: "server", command: [bun, "run", "dev"] },
		{ service: "web", directory: "web", command: [bun, "run", "dev"] },
		{
			service: "mobile",
			directory: "mobile",
			command: [bun, "run", "start", "--dev-client", "--port", "8081"],
		},
	];
}

export function startPlan(options: { bun: string; port: number; stateDir: string }): string[] {
	const lines = [
		"== Checking PostgreSQL ==",
		`127.0.0.1:${options.port}`,
		"== Checking mobile install ==",
		"mobile/node_modules",
		"== Checking ports ==",
		...SANDBOX_PORTS.map(String),
	];
	for (const service of startCommands(options.bun)) {
		lines.push(
			`== Starting ${service.service} ==`,
			service.command.join(" "),
			service.directory,
		);
	}
	lines.push(
		"Web: http://127.0.0.1:5173/assemblies | Inbox: http://127.0.0.1:3000/development/mailbox | Expo: localhost:8081",
		`Logs: ${options.stateDir}; Ctrl+C or 'stop' stops app services. PostgreSQL remains running.`,
	);
	return lines;
}

export function sandboxChildEnv(
	base: NodeJS.ProcessEnv,
	paths: SandboxPaths,
	port: number,
): NodeJS.ProcessEnv {
	const env = definedEnv(base);
	delete env.PORT;
	return {
		...env,
		PYTHON_BIN: join(paths.stateDir, "venv/bin/python"),
		NODE_ENV: "development",
		DAVAR_DEV_SANDBOX: "1",
		DATABASE_URL: sandboxDatabaseUrl(port),
		API_PUBLIC_URL: "http://127.0.0.1:3000",
		API_HOSTS: "localhost,127.0.0.1",
		WEB_ORIGINS,
		AUTH_RETURN_URIS,
		INVITE_GATE_ENABLED: "true",
		EXPO_PUBLIC_API_URL: "http://127.0.0.1:3000",
		EXPO_PUBLIC_DEV_SANDBOX: "1",
		PUBLIC_API_URL: "http://127.0.0.1:3000",
		PUBLIC_DEV_SANDBOX: "1",
		HOST: "127.0.0.1",
	};
}

export function serviceEnv(
	base: NodeJS.ProcessEnv,
	paths: SandboxPaths,
	port: number,
	service: string,
): NodeJS.ProcessEnv {
	const env = sandboxChildEnv(base, paths, port);
	env.CI = "1";
	if (service === "api") env.PORT = "3000";
	return env;
}

export function parseProcessEntries(text: string): ProcessEntry[] {
	const parsed: unknown = JSON.parse(text);
	if (!Array.isArray(parsed)) throw new Error("Sandbox process file is not a list");
	return parsed.map((item) => {
		if (typeof item !== "object" || item === null) {
			throw new Error("Sandbox process entry is not an object");
		}
		const record = item as Record<string, unknown>;
		const pid = record.pid;
		const service = record.service;
		const signature = record.signature;
		if (typeof pid !== "number" || !Number.isInteger(pid)) {
			throw new Error("Sandbox process entry has no pid");
		}
		if (typeof service !== "string" || service === "") {
			throw new Error("Sandbox process entry has no service");
		}
		if (signature === null) return { pid, signature: null, service };
		if (typeof signature !== "string") {
			throw new Error("Sandbox process entry has a bad signature");
		}
		const trimmed = signature.trim();
		return { pid, signature: trimmed.length > 0 ? trimmed : null, service };
	});
}

export function stopTargets(
	entries: ProcessEntry[],
	signatureOf: (pid: number) => string | null,
): number[] {
	const targets: number[] = [];
	for (const entry of entries) {
		if (!entry.signature) continue;
		if (!Number.isInteger(entry.pid) || entry.pid <= 1) continue;
		if (entry.pid === process.pid) continue;
		if (signatureOf(entry.pid) !== entry.signature) continue;
		targets.push(entry.pid);
	}
	return targets;
}

export function processSignature(pid: number): string | null {
	if (!Number.isInteger(pid) || pid <= 0) return null;
	const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8" });
	if (result.status !== 0) return null;
	const text = (result.stdout ?? "").trim();
	return text.length > 0 ? text : null;
}

export function signalProcessGroup(pid: number): void {
	if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return;
	try {
		process.kill(-pid, "SIGTERM");
	} catch (error) {
		if (errorCode(error) === "ESRCH") return;
		throw error;
	}
}

export function stopServices(options: {
	stateDir: string;
	signatureOf: (pid: number) => string | null;
	signalGroup: (pid: number) => void;
	claimPid?: number;
}): number[] {
	const path = join(options.stateDir, "processes.json");
	if (!existsSync(path)) return [];
	const claimed = `${path}.stopping-${options.claimPid ?? process.pid}`;
	try {
		renameSync(path, claimed);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return [];
		throw error;
	}
	let entries: ProcessEntry[];
	try {
		entries = parseProcessEntries(readFileSync(claimed, "utf8"));
	} catch (error) {
		try {
			renameSync(claimed, path);
		} catch {
			throw error;
		}
		throw error;
	}
	const targets = stopTargets(entries, options.signatureOf);
	for (const pid of targets) options.signalGroup(pid);
	rmSync(claimed, { force: true });
	return targets;
}

export async function main(
	argv: string[],
	env: NodeJS.ProcessEnv,
	io: SandboxIo,
	paths: SandboxPaths = defaultPaths(),
	deps: SandboxDeps = realDeps(),
): Promise<number> {
	let args: SandboxArgs;
	try {
		args = parseSandboxArgs(argv);
	} catch (error) {
		io.error(error instanceof Error ? error.message : String(error));
		io.error(helpText());
		return 1;
	}
	if (args.command === "help") {
		io.log(helpText());
		return 0;
	}
	const refusal = developmentRefusal(env);
	if (refusal) {
		io.error(refusal);
		return 1;
	}
	let port: number;
	try {
		port = postgresPort(env);
	} catch (error) {
		io.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
	try {
		if (args.dryRun) {
			if (args.command === "stop") return printStopDryRun(paths, io, deps);
			const bun = bunBin(env);
			const lines =
				args.command === "setup"
					? setupPlan({ bun, python: resolveBasePython(env), port })
					: startPlan({ bun, port, stateDir: paths.stateDir });
			io.log(lines.join("\n"));
			return 0;
		}
		if (args.command === "setup") return await executeSetup(env, io, paths, deps, port);
		if (args.command === "start") return await executeStart(env, io, paths, deps, port);
		stopServices({
			stateDir: paths.stateDir,
			signatureOf: deps.signatureOf,
			signalGroup: deps.signalGroup,
		});
		return 0;
	} catch (error) {
		io.error(redact(error instanceof Error ? error.message : String(error), port));
		return 1;
	}
}

async function executeSetup(
	env: NodeJS.ProcessEnv,
	io: SandboxIo,
	paths: SandboxPaths,
	deps: SandboxDeps,
	port: number,
): Promise<number> {
	const bun = bunBin(env);
	const python = resolveBasePython(env);
	const child = sandboxChildEnv(env, paths, port);
	const venvDir = join(paths.stateDir, "venv");
	const venvPython = join(venvDir, "bin/python");
	io.log("== Installing web dependencies ==");
	await deps.run([bun, "install", "--frozen-lockfile"], paths.webRoot, child);
	io.log("== Installing mobile dependencies ==");
	await deps.run([bun, "install", "--frozen-lockfile"], paths.mobileRoot, child);
	mkdirSync(paths.stateDir, { recursive: true });
	if (!deps.exists(venvPython)) {
		io.log("== Creating Python venv ==");
		await deps.run([python, "-m", "venv", venvDir], paths.root, child);
	}
	io.log("== Installing Python requirements ==");
	await deps.run([venvPython, "-m", "pip", "install", "-r", paths.requirements], paths.root, child);
	io.log("== Checking PostgreSQL ==");
	if (!(await deps.connect(port))) {
		io.error(postgresMessage(port));
		return 1;
	}
	io.log("== Installing server and preparing database ==");
	await deps.run(["bash", join(paths.serverRoot, "bin/setup"), "--skip-server"], paths.serverRoot, child);
	io.log("== Seeding sandbox ==");
	await deps.run([bun, "run", "sandbox:seed"], paths.serverRoot, child);
	io.log("== Syncing calendar ==");
	await deps.run([bun, "run", "jobs:calendar"], paths.serverRoot, child);
	io.log("== Building web ==");
	await deps.run([bun, "./build.ts"], paths.webRoot, child);
	io.log("Ready. Run server/bin/dev-sandbox start. Inbox: http://127.0.0.1:3000/development/mailbox");
	return 0;
}

async function executeStart(
	env: NodeJS.ProcessEnv,
	io: SandboxIo,
	paths: SandboxPaths,
	deps: SandboxDeps,
	port: number,
): Promise<number> {
	if (!(await deps.connect(port))) {
		io.error(postgresMessage(port));
		return 1;
	}
	if (!deps.exists(join(paths.mobileRoot, "node_modules"))) {
		io.error("Run setup first");
		return 1;
	}
	for (const appPort of SANDBOX_PORTS) {
		if (await deps.connect(appPort)) {
			io.error(`Port ${appPort} is already occupied; stop its existing service first`);
			return 1;
		}
	}
	mkdirSync(paths.stateDir, { recursive: true });
	const entries: ProcessEntry[] = [];
	const spawned: SpawnedGroup[] = [];
	const directories: Record<string, string> = {
		server: paths.serverRoot,
		web: paths.webRoot,
		mobile: paths.mobileRoot,
	};
	for (const service of startCommands(bunBin(env))) {
		const cwd = directories[service.directory];
		if (!cwd) throw new Error(`Unknown sandbox directory: ${service.directory}`);
		const childEnv = serviceEnv(env, paths, port, service.service);
		const logPath = join(paths.stateDir, `${service.service}.log`);
		const group = deps.spawnGroup(service.command, cwd, childEnv, logPath);
		spawned.push(group);
		entries.push({
			pid: group.pid,
			signature: deps.signatureOf(group.pid),
			service: service.service,
		});
	}
	writeFileSync(join(paths.stateDir, "processes.json"), JSON.stringify(entries));
	for (const line of startPlan({ bun: bunBin(env), port, stateDir: paths.stateDir }).slice(-2)) {
		io.log(line);
	}
	return waitForServices(paths, deps, io, spawned);
}

function waitForServices(
	paths: SandboxPaths,
	deps: SandboxDeps,
	io: SandboxIo,
	spawned: SpawnedGroup[],
): Promise<number> {
	return new Promise((resolve) => {
		let done = false;
		const stop = () => {
			stopServices({
				stateDir: paths.stateDir,
				signatureOf: deps.signatureOf,
				signalGroup: deps.signalGroup,
			});
		};
		const finish = (code: number, message?: string) => {
			if (done) return;
			done = true;
			process.off("SIGINT", onSignal);
			process.off("SIGTERM", onSignal);
			try {
				stop();
			} catch (error) {
				io.error(error instanceof Error ? error.message : String(error));
				resolve(1);
				return;
			}
			if (message) io.error(message);
			resolve(code);
		};
		const onSignal = () => {
			finish(0);
		};
		process.on("SIGINT", onSignal);
		process.on("SIGTERM", onSignal);
		for (const group of spawned) {
			void group.exited.then(() => {
				finish(1, "A sandbox service exited; inspect the logs");
			});
		}
	});
}

function printStopDryRun(paths: SandboxPaths, io: SandboxIo, deps: SandboxDeps): number {
	io.log(["== Stopping app services ==", "PostgreSQL remains running."].join("\n"));
	const path = join(paths.stateDir, "processes.json");
	if (!existsSync(path)) {
		io.log("No sandbox process file.");
		return 0;
	}
	const entries = parseProcessEntries(readFileSync(path, "utf8"));
	const targets = stopTargets(entries, deps.signatureOf);
	if (targets.length === 0) {
		io.log("No matching app process group.");
		return 0;
	}
	for (const pid of targets) io.log(`TERM process group ${pid}`);
	return 0;
}

function realDeps(): SandboxDeps {
	return {
		connect: connectPort,
		run: runCommand,
		spawnGroup,
		signatureOf: processSignature,
		signalGroup: signalProcessGroup,
		exists: existsSync,
	};
}

function spawnGroup(
	command: Command,
	cwd: string,
	env: NodeJS.ProcessEnv,
	logPath: string,
): SpawnedGroup {
	const logFd = openSync(logPath, "a");
	try {
		const [file, ...args] = command;
		const child = spawn(file, args, {
			cwd,
			env: definedEnv(env),
			detached: true,
			stdio: ["ignore", logFd, logFd],
		});
		if (!child.pid) throw new Error(`${command.join(" ")} did not start`);
		const exited = new Promise<number | null>((resolve) => {
			child.once("exit", (code) => resolve(code));
		});
		return { pid: child.pid, exited };
	} finally {
		closeSync(logFd);
	}
}

async function runCommand(command: Command, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
	const proc = Bun.spawn([...command], {
		cwd,
		env,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await proc.exited;
	if (code !== 0) throw new Error(`${command.join(" ")} exited ${code}`);
}

function connectPort(port: number, host = "127.0.0.1"): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connectSocket({ host, port });
		let settled = false;
		const finish = (open: boolean) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(open);
		};
		socket.setTimeout(1000);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});
}

function developmentRefusal(env: NodeJS.ProcessEnv): string | null {
	const name = env.NODE_ENV ?? "development";
	if (name === "staging" || name === "production") {
		return `dev-sandbox runs in development, not ${name}`;
	}
	return null;
}

function postgresMessage(port: number): string {
	return `Start local PostgreSQL on port ${port} first. The sandbox uses its own davar_v2_sandbox database.`;
}

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (typeof value === "string") out[key] = value;
	}
	return out;
}

function redact(text: string, port: number): string {
	const url = sandboxDatabaseUrl(port);
	let out = text.split(url).join(`127.0.0.1:${port}/davar_v2_sandbox`);
	try {
		const password = decodeURIComponent(new URL(url).password);
		if (password) out = out.split(password).join("[redacted]");
	} catch {
		return out;
	}
	return out;
}

function errorCode(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "code" in error) {
		const code = (error as { code?: unknown }).code;
		return typeof code === "string" ? code : undefined;
	}
	return undefined;
}

if (import.meta.main) {
	const code = await main(process.argv.slice(2), process.env, {
		log: (line) => console.log(line),
		error: (line) => console.error(line),
	});
	process.exit(code);
}
