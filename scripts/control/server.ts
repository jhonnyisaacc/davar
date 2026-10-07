#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	alive,
	ensureRunDir,
	envStrings,
	evidenceDir,
	killRecorded,
	lastAction,
	listeners,
	ownsPort,
	readJson,
	readPid,
	rememberAction,
	removeTree,
	repoRoot,
	runDir,
	spawnLogged,
	waitUntil,
	writeJson,
	writePid,
} from "./proc.ts";
import { finish } from "./report.ts";

const app = "server";

function port(): number {
	return readJson<{ port: number }>(app, "ports.json")?.port ?? Number(process.env.DAVAR_SERVER_PORT ?? 3000);
}

function commandExists(name: string): boolean {
	if (Bun.which(name)) return true;
	return existsSync(join(process.env.HOME ?? "", ".bun", "bin", name));
}

async function probe(path: string): Promise<{ status: number; body: string }> {
	const response = await fetch(`http://127.0.0.1:${port()}${path}`, {
		headers: { accept: "application/json" },
	});
	const body = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 500);
	return { status: response.status, body };
}

async function doctor(): Promise<never> {
	const listen = port();
	const pid = readPid(app, "server");
	if (!alive(pid)) finish(false, { app, command: "doctor", reason: "not-running" });
	if (!ownsPort(pid as number, listen)) {
		finish(false, { app, command: "doctor", reason: "port-not-ours", port: listen });
	}
	let health: { status: number; body: string };
	try {
		health = await probe("/up");
	} catch {
		finish(false, { app, command: "doctor", reason: "health-down", port: listen });
	}
	if (health.status !== 200 || !health.body.includes('"status":"ok"') && !health.body.includes('"status": "ok"')) {
		finish(false, { app, command: "doctor", reason: "health-down", http: health.status, body: health.body });
	}
	finish(true, {
		app,
		command: "doctor",
		url: `http://127.0.0.1:${listen}`,
		port: listen,
		pid: pid as number,
		http: health.status,
		body: health.body,
	});
}

async function start(): Promise<never> {
	if (!commandExists("bun")) finish(false, { app, command: "start", reason: "bun-missing" });
	const database = process.env.DATABASE_URL;
	if (!database) finish(false, { app, command: "start", reason: "database-url-missing" });
	const listen = Number(process.env.DAVAR_SERVER_PORT ?? 3000);
	if (alive(readPid(app, "server"))) {
		finish(false, { app, command: "start", reason: "already-running" });
	}
	if (listeners(listen).length > 0) {
		finish(false, { app, command: "start", reason: "port-busy", port: listen });
	}
	const dir = ensureRunDir(app);
	const envPath = join(repoRoot, "server", ".env");
	if (!existsSync(envPath)) {
		const example = join(repoRoot, "server", ".env.example");
		if (!existsSync(example)) finish(false, { app, command: "start", reason: "env-missing" });
		writeFileSync(envPath, readFileSync(example));
		writeFileSync(join(dir, "created-env"), "server/.env\n");
	}
	writeJson(app, "ports.json", { port: listen });
	const log = join(dir, "server.log");
	writeFileSync(log, "");
	const pid = spawnLogged(
		["bun", "--env-file=.env", "./src/index.ts"],
		join(repoRoot, "server"),
		envStrings({
			PORT: String(listen),
			HOST: "127.0.0.1",
			NODE_ENV: "development",
			DATABASE_URL: database,
		}),
		log,
	);
	writePid(app, "server", pid);
	const ready = await waitUntil(
		async () => {
			if (!ownsPort(pid, listen)) return false;
			try {
				const health = await probe("/up");
				return health.status === 200;
			} catch {
				return false;
			}
		},
		20000,
		() => alive(pid),
	);
	if (ready !== "ok") {
		await killRecorded(app, ["server"]);
		finish(false, {
			app,
			command: "start",
			reason: ready === "exited" ? "server-exited" : "start-timeout",
			log,
		});
	}
	finish(true, { app, command: "start", url: `http://127.0.0.1:${listen}`, port: listen, pid });
}

async function stop(): Promise<never> {
	const stopped = await killRecorded(app, ["server"]);
	finish(true, { app, command: "stop", stopped });
}

async function drive(args: string[]): Promise<never> {
	const pid = readPid(app, "server");
	if (!alive(pid) || !ownsPort(pid as number, port())) {
		finish(false, { app, command: "drive", reason: "not-running" });
	}
	if (args[0] !== "get" || !args[1]?.startsWith("/") || args[1].startsWith("//")) {
		finish(false, { app, command: "drive", reason: "path-required" });
	}
	const path = args[1];
	let result: { status: number; body: string };
	try {
		result = await probe(path);
	} catch {
		finish(false, { app, command: "drive", reason: "request-failed", path });
	}
	const record = join(ensureRunDir(app), "last.body");
	writeFileSync(record, `${result.body}\n`);
	writeFileSync(join(runDir(app), "last.http"), `${result.status}\n`);
	rememberAction(app, `get ${path}`);
	const ok = result.status >= 200 && result.status < 300;
	finish(ok, { app, command: "drive", action: "get", path, http: result.status, body: result.body });
}

async function state(): Promise<never> {
	const pid = readPid(app, "server");
	if (!alive(pid)) finish(false, { app, command: "state", reason: "not-running" });
	const http = existsSync(join(runDir(app), "last.http"))
		? readFileSync(join(runDir(app), "last.http"), "utf8").trim()
		: "";
	const body = existsSync(join(runDir(app), "last.body"))
		? readFileSync(join(runDir(app), "last.body"), "utf8").trim()
		: "";
	let health = "";
	try {
		const probeResult = await probe("/up");
		health = probeResult.body;
	} catch {
		health = "down";
	}
	finish(true, {
		app,
		command: "state",
		url: `http://127.0.0.1:${port()}`,
		health,
		http: http || "none",
		body: body || "none",
	});
}

async function evidence(): Promise<never> {
	const dir = evidenceDir(app, lastAction(app));
	const bodyPath = join(runDir(app), "last.body");
	if (!existsSync(bodyPath)) {
		finish(false, { app, command: "evidence", reason: "no-response" });
	}
	writeFileSync(join(dir, "response.txt"), readFileSync(bodyPath));
	const http = existsSync(join(runDir(app), "last.http"))
		? readFileSync(join(runDir(app), "last.http"), "utf8").trim()
		: "";
	writeFileSync(join(dir, "http.txt"), `${http}\n`);
	finish(true, { app, command: "evidence", path: dir, http: http || "none" });
}

async function reset(): Promise<never> {
	const marker = join(runDir(app), "created-env");
	const created = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "";
	await killRecorded(app, ["server"]);
	removeTree(runDir(app));
	if (created === "server/.env") removeTree(join(repoRoot, "server", ".env"));
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
