#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensureRunDir,
	evidenceDir,
	lastAction,
	readJson,
	rememberAction,
	removeTree,
	repoRoot,
	runDir,
	shellQuote,
	waitUntil,
	writeJson,
} from "./proc.ts";
import { finish } from "./report.ts";

const app = "worker";
const tmuxConfig = "/exec-daemon/tmux.portal.conf";

function session(): string {
	return (
		readJson<{ session: string }>(app, "session.json")?.session ??
		process.env.DAVAR_WORKER_SESSION ??
		"davar-verify-worker"
	);
}

function tmux(args: string[]) {
	const prefix = existsSync(tmuxConfig) ? ["-f", tmuxConfig] : [];
	return Bun.spawnSync(["tmux", ...prefix, ...args]);
}

function sessionUp(name: string): boolean {
	return tmux(["has-session", "-t", `=${name}`]).exitCode === 0;
}

function pythonReady(): boolean {
	return (
		Bun.spawnSync([
			"python3",
			"-c",
			"import jsonschema, referencing",
		]).exitCode === 0
	);
}

async function doctor(): Promise<never> {
	if (!Bun.which("tmux")) {
		finish(false, { app, command: "doctor", reason: "tmux-missing" });
	}
	if (!Bun.which("python3")) {
		finish(false, { app, command: "doctor", reason: "python-missing" });
	}
	if (!pythonReady()) {
		finish(false, { app, command: "doctor", reason: "python-deps-missing" });
	}
	const name = session();
	if (!sessionUp(name)) {
		finish(false, { app, command: "doctor", reason: "not-running", session: name });
	}
	finish(true, { app, command: "doctor", session: name, python: "python3" });
}

async function start(): Promise<never> {
	if (!pythonReady()) {
		finish(false, { app, command: "start", reason: "python-deps-missing" });
	}
	const name = process.env.DAVAR_WORKER_SESSION ?? "davar-verify-worker";
	if (sessionUp(name)) {
		finish(false, { app, command: "start", reason: "already-running", session: name });
	}
	ensureRunDir(app);
	writeJson(app, "session.json", { session: name });
	const created = tmux([
		"new-session",
		"-d",
		"-s",
		name,
		"-c",
		repoRoot,
		"--",
		"bash",
		"-l",
	]);
	if (created.exitCode !== 0 || !sessionUp(name)) {
		finish(false, { app, command: "start", reason: "session-failed", session: name });
	}
	await Bun.sleep(400);
	finish(true, { app, command: "start", session: name });
}

async function stop(): Promise<never> {
	const name = session();
	if (!sessionUp(name)) finish(true, { app, command: "stop", stopped: 0 });
	tmux(["kill-session", "-t", `=${name}`]);
	finish(true, { app, command: "stop", stopped: sessionUp(name) ? 0 : 1 });
}

async function drive(args: string[]): Promise<never> {
	const action = args[0] ?? "";
	if (action !== "validate" && action !== "check") {
		finish(false, { app, command: "drive", reason: "unknown-action" });
	}
	const name = session();
	if (!sessionUp(name)) {
		finish(false, { app, command: "drive", reason: "not-running", session: name });
	}
	const dir = ensureRunDir(app);
	const log = join(dir, "last.log");
	const codePath = join(dir, "last.exit");
	if (existsSync(log)) rmSync(log);
	if (existsSync(codePath)) rmSync(codePath);
	const command = `cd ${shellQuote(repoRoot)} && PYTHONPATH=. python3 -m scripts.knowledge ${action} > ${shellQuote(log)} 2>&1; echo $? > ${shellQuote(codePath)}`;
	const sent = tmux(["send-keys", "-t", name, command, "C-m"]);
	if (sent.exitCode !== 0) {
		finish(false, { app, command: "drive", reason: "send-failed", session: name });
	}
	const done = await waitUntil(() => existsSync(codePath), action === "check" ? 180000 : 60000);
	if (done !== "ok") {
		finish(false, { app, command: "drive", reason: "timeout", action });
	}
	const exitCode = Number(readFileSync(codePath, "utf8").trim());
	const text = existsSync(log) ? readFileSync(log, "utf8").trim() : "";
	const tail = text.split("\n").slice(-3).join(" | ").slice(0, 400);
	rememberAction(app, action);
	finish(exitCode === 0, {
		app,
		command: "drive",
		action,
		exit: Number.isInteger(exitCode) ? exitCode : 1,
		tail: tail || "empty",
	});
}

async function state(): Promise<never> {
	const name = session();
	if (!sessionUp(name)) finish(false, { app, command: "state", reason: "not-running" });
	const codePath = join(runDir(app), "last.exit");
	const log = join(runDir(app), "last.log");
	const exitCode = existsSync(codePath) ? readFileSync(codePath, "utf8").trim() : "none";
	const text = existsSync(log) ? readFileSync(log, "utf8").trim() : "";
	const tail = text ? text.split("\n").slice(-3).join(" | ").slice(0, 400) : "none";
	finish(true, { app, command: "state", session: name, exit: exitCode, tail });
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
	const name = session();
	if (sessionUp(name)) tmux(["kill-session", "-t", `=${name}`]);
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
