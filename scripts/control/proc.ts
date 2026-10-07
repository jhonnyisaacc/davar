import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const repoRoot = join(import.meta.dir, "..", "..");

export function runDir(app: string): string {
	const root = process.env.DAVAR_VERIFY_ROOT ?? "/tmp/davar-verify";
	return join(root, app);
}

export function ensureRunDir(app: string): string {
	const dir = runDir(app);
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function envStrings(
	extra: Record<string, string | undefined>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) out[key] = value;
	}
	const prefix = `${out.HOME ?? ""}/.bun/bin`;
	if (prefix.length > "/.bun/bin".length && !out.PATH?.includes(prefix)) {
		out.PATH = `${prefix}:${out.PATH ?? ""}`;
	}
	for (const [key, value] of Object.entries(extra)) {
		if (value !== undefined) out[key] = value;
	}
	return out;
}

export function readPid(app: string, name: string): number | null {
	const path = join(runDir(app), `${name}.pid`);
	if (!existsSync(path)) return null;
	const value = Number(readFileSync(path, "utf8").trim());
	return Number.isInteger(value) && value > 0 ? value : null;
}

export function writePid(app: string, name: string, pid: number): void {
	writeFileSync(join(ensureRunDir(app), `${name}.pid`), `${pid}\n`);
}

export function alive(pid: number | null): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function descendants(pid: number): number[] {
	const result = Bun.spawnSync(["ps", "-o", "pid=", "--ppid", String(pid)]);
	const children = result.stdout
		.toString()
		.split("\n")
		.map((line) => Number(line.trim()))
		.filter((value) => value > 0);
	return [pid, ...children.flatMap((child) => descendants(child))];
}

export function listeners(port: number): number[] {
	const result = Bun.spawnSync([
		"lsof",
		"-nP",
		`-iTCP:${port}`,
		"-sTCP:LISTEN",
		"-t",
	]);
	if (result.exitCode !== 0) return [];
	return result.stdout
		.toString()
		.split("\n")
		.map((line) => Number(line.trim()))
		.filter((value) => value > 0);
}

export function ownsPort(pid: number, port: number): boolean {
	const ours = new Set(descendants(pid));
	return listeners(port).some((listener) => ours.has(listener));
}

export function killTree(pid: number): void {
	for (const child of descendants(pid).filter((value) => value !== pid)) {
		killTree(child);
	}
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return;
	}
}

export async function killRecorded(app: string, names: string[]): Promise<number> {
	const pids = names
		.map((name) => readPid(app, name))
		.filter((pid): pid is number => alive(pid));
	for (const pid of pids) killTree(pid);
	const deadline = Date.now() + 4000;
	while (pids.some((pid) => alive(pid)) && Date.now() < deadline) {
		await Bun.sleep(100);
	}
	for (const pid of pids) {
		if (!alive(pid)) continue;
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			continue;
		}
	}
	for (const name of names) {
		const path = join(runDir(app), `${name}.pid`);
		if (existsSync(path)) rmSync(path);
	}
	return pids.length;
}

export function spawnLogged(
	args: string[],
	cwd: string,
	env: Record<string, string>,
	logPath: string,
): number {
	const command = `exec ${args.map(shellQuote).join(" ")} >> ${shellQuote(logPath)} 2>&1`;
	const proc = Bun.spawn(["bash", "-c", command], {
		cwd,
		env,
		stdin: "ignore",
		stdout: "ignore",
		stderr: "ignore",
	});
	return proc.pid;
}

export function writeJson(app: string, name: string, value: unknown): void {
	writeFileSync(
		join(ensureRunDir(app), name),
		`${JSON.stringify(value)}\n`,
	);
}

export function readJson<T>(app: string, name: string): T | null {
	const path = join(runDir(app), name);
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function rememberAction(app: string, action: string): void {
	const path = join(ensureRunDir(app), "transcript.txt");
	const prior = existsSync(path) ? readFileSync(path, "utf8") : "";
	writeFileSync(path, `${prior}${action}\n`);
	writeFileSync(join(runDir(app), "last-action"), `${action}\n`);
}

export function lastAction(app: string): string {
	const path = join(runDir(app), "last-action");
	if (!existsSync(path)) return "state";
	return readFileSync(path, "utf8").trim() || "state";
}

export function evidenceDir(app: string, name: string): string {
	const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
	const slug = name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "evidence";
	const dir = join(repoRoot, "artifacts", "verify", app, `${stamp}-${slug}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function copyIfExists(from: string, to: string): boolean {
	if (!existsSync(from)) return false;
	writeFileSync(to, readFileSync(from));
	return true;
}

export function removeTree(path: string): void {
	if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

export async function waitUntil(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs: number,
	stillAlive?: () => boolean,
): Promise<"ok" | "timeout" | "exited"> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (stillAlive && !stillAlive()) return "exited";
		if (await predicate()) return "ok";
		await Bun.sleep(250);
	}
	return "timeout";
}
