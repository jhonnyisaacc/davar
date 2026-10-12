#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensureRunDir,
	envStrings,
	evidenceDir,
	lastAction,
	readJson,
	rememberAction,
	removeTree,
	repoRoot,
	runDir,
	writeJson,
} from "./proc.ts";
import { finish } from "./report.ts";

const app = "python";

const fixtureArgs = [
	"-m",
	"scripts.delitzsch",
	"normalize-holem",
	"--books",
	"__pin_absent__",
	"--dry-run",
];

function pythonBin(): string {
	return process.env.DAVAR_PYTHON ?? "python3";
}

function pythonFound(): boolean {
	const bin = pythonBin();
	if (bin.includes("/")) return existsSync(bin);
	return Bun.which(bin) !== null;
}

function started(): boolean {
	return readJson<{ python: string }>(app, "session.json") !== null;
}

function pythonPin(): string | null {
	const path = join(repoRoot, "mise.toml");
	if (!existsSync(path)) return null;
	const match = readFileSync(path, "utf8").match(/^python\s*=\s*"([^"]+)"/m);
	return match?.[1] ?? null;
}

function runPython(args: string[]): { exitCode: number; stdout: string; stderr: string } {
	const result = Bun.spawnSync([pythonBin(), ...args], {
		cwd: repoRoot,
		env: envStrings({ PYTHONPATH: repoRoot }),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode ?? 1,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

function canImport(name: string): boolean {
	return runPython(["-c", `import ${name}`]).exitCode === 0;
}

function version(): string {
	const result = runPython([
		"-c",
		"import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')",
	]);
	return result.exitCode === 0 ? result.stdout.trim() : "unknown";
}

function matchesPin(actual: string, pin: string): boolean {
	return actual === pin || actual.startsWith(`${pin}.`);
}

async function doctor(): Promise<never> {
	if (!pythonFound()) {
		finish(false, { app, command: "doctor", reason: "python-missing" });
	}
	const pin = pythonPin();
	if (!pin) finish(false, { app, command: "doctor", reason: "pin-missing" });
	const actual = version();
	if (actual === "unknown") {
		finish(false, { app, command: "doctor", reason: "python-missing" });
	}
	const pytest = canImport("pytest") ? "present" : "missing";
	const jsonschema = canImport("jsonschema") ? "present" : "missing";
	const deps = pytest === "present" && jsonschema === "present";
	const fields: Record<string, string | number> = {
		app,
		command: "doctor",
		python: actual,
		pin: pin as string,
		gap: matchesPin(actual, pin as string) ? "no" : "yes",
		pytest,
		jsonschema,
	};
	if (!deps) fields.reason = "python-deps-missing";
	finish(deps, fields);
}

async function start(): Promise<never> {
	if (!pythonFound()) {
		finish(false, { app, command: "start", reason: "python-missing" });
	}
	if (started()) {
		finish(false, { app, command: "start", reason: "already-running" });
	}
	ensureRunDir(app);
	writeJson(app, "session.json", { python: pythonBin() });
	finish(true, { app, command: "start", python: pythonBin() });
}

async function stop(): Promise<never> {
	if (!started()) finish(true, { app, command: "stop", stopped: 0 });
	rmSync(join(runDir(app), "session.json"));
	finish(true, { app, command: "stop", stopped: 1 });
}

async function drive(args: string[]): Promise<never> {
	const action = args[0] ?? "";
	if (action !== "help" && action !== "fixture") {
		finish(false, { app, command: "drive", reason: "unknown-action" });
	}
	if (!started()) {
		finish(false, { app, command: "drive", reason: "not-running" });
	}
	const pyArgs = action === "help" ? ["-m", "scripts.dict", "--help"] : fixtureArgs;
	const dir = ensureRunDir(app);
	const result = runPython(pyArgs);
	writeFileSync(join(dir, "last.log"), result.stdout);
	writeFileSync(join(dir, "last.err"), result.stderr);
	writeFileSync(join(dir, "last.exit"), `${result.exitCode}\n`);
	rememberAction(app, action);
	const text = result.stdout.trim();
	const tail = text ? text.split("\n").slice(-3).join(" | ").slice(0, 400) : "empty";
	finish(result.exitCode === 0, {
		app,
		command: "drive",
		action,
		exit: result.exitCode,
		tail,
	});
}

async function state(): Promise<never> {
	if (!started()) finish(false, { app, command: "state", reason: "not-running" });
	const codePath = join(runDir(app), "last.exit");
	const log = join(runDir(app), "last.log");
	const exitCode = existsSync(codePath) ? readFileSync(codePath, "utf8").trim() : "none";
	const text = existsSync(log) ? readFileSync(log, "utf8").trim() : "";
	const tail = text ? text.split("\n").slice(-3).join(" | ").slice(0, 400) : "none";
	finish(true, { app, command: "state", exit: exitCode, tail });
}

async function evidence(): Promise<never> {
	const log = join(runDir(app), "last.log");
	if (!existsSync(log)) finish(false, { app, command: "evidence", reason: "no-output" });
	const dir = evidenceDir(app, lastAction(app));
	writeFileSync(join(dir, "output.txt"), readFileSync(log));
	const codePath = join(runDir(app), "last.exit");
	if (existsSync(codePath)) writeFileSync(join(dir, "exit.txt"), readFileSync(codePath));
	finish(true, { app, command: "evidence", path: dir });
}

async function reset(): Promise<never> {
	removeTree(runDir(app));
	finish(true, { app, command: "reset" });
}

const command = process.argv[2] ?? "";
const args = process.argv.slice(3);
if (command === "doctor") await doctor();
else if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "drive") await drive(args);
else if (command === "state") await state();
else if (command === "evidence") await evidence();
else if (command === "reset") await reset();
else finish(false, { app, command: command || "none", reason: "unknown-command" });
