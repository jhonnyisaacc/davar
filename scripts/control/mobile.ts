#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	alive,
	ensureRunDir,
	envStrings,
	killRecorded,
	listeners,
	ownsPort,
	readPid,
	removeTree,
	repoRoot,
	runDir,
	spawnLogged,
	waitUntil,
	writePid,
} from "./proc.ts";
import { finish } from "./report.ts";

const app = "mobile";

type ExpoConfig = {
	expo?: {
		version?: string;
		scheme?: string;
		android?: { package?: string };
		ios?: { bundleIdentifier?: string };
	};
};

function config(): ExpoConfig {
	return JSON.parse(readFileSync(join(repoRoot, "mobile", "app.json"), "utf8")) as ExpoConfig;
}

function metroPort(): number {
	return Number(process.env.DAVAR_MOBILE_PORT ?? 8081);
}

function describe(): Record<string, string | number> {
	const expo = config().expo ?? {};
	return {
		version: expo.version ?? "unknown",
		scheme: expo.scheme ?? "unknown",
		bundle: expo.android?.package ?? "unknown",
		ios: expo.ios?.bundleIdentifier ?? "unknown",
	};
}

async function doctor(): Promise<never> {
	const fields = describe();
	const deps = existsSync(join(repoRoot, "mobile", "node_modules", "expo"));
	finish(true, {
		app,
		command: "doctor",
		...fields,
		deps: deps ? "present" : "missing",
		drive: "unimplemented",
		reason: "maestro",
	});
}

async function start(): Promise<never> {
	if (!existsSync(join(repoRoot, "mobile", "node_modules", "expo"))) {
		finish(false, { app, command: "start", reason: "deps-missing" });
	}
	const port = metroPort();
	if (alive(readPid(app, "metro"))) {
		finish(false, { app, command: "start", reason: "already-running" });
	}
	if (listeners(port).length > 0) {
		finish(false, { app, command: "start", reason: "port-busy", port });
	}
	const dir = ensureRunDir(app);
	const log = join(dir, "metro.log");
	const args =
		port === 8081
			? ["bun", "run", "start"]
			: ["bun", "x", "expo", "start", "--port", String(port)];
	const pid = spawnLogged(
		args,
		join(repoRoot, "mobile"),
		envStrings({ CI: "1", EXPO_NO_TELEMETRY: "1" }),
		log,
	);
	writePid(app, "metro", pid);
	const ready = await waitUntil(
		() => ownsPort(pid, port),
		60000,
		() => alive(pid),
	);
	if (ready !== "ok") {
		await killRecorded(app, ["metro"]);
		finish(false, {
			app,
			command: "start",
			reason: ready === "exited" ? "metro-exited" : "start-timeout",
			log,
		});
	}
	finish(true, { app, command: "start", port, pid, drive: "unimplemented" });
}

async function stop(): Promise<never> {
	const stopped = await killRecorded(app, ["metro"]);
	finish(true, { app, command: "stop", stopped });
}

async function drive(): Promise<never> {
	finish(false, { app, command: "drive", reason: "maestro-unimplemented" });
}

async function state(): Promise<never> {
	const port = metroPort();
	const pid = readPid(app, "metro");
	const metro = alive(pid) && ownsPort(pid as number, port) ? "up" : "down";
	finish(true, {
		app,
		command: "state",
		...describe(),
		metro,
		port,
		drive: "unimplemented",
	});
}

async function evidence(): Promise<never> {
	finish(false, { app, command: "evidence", reason: "maestro-unimplemented" });
}

async function reset(): Promise<never> {
	await killRecorded(app, ["metro"]);
	removeTree(runDir(app));
	finish(true, { app, command: "reset" });
}

const command = process.argv[2] ?? "";
if (command === "doctor") await doctor();
else if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "drive") await drive();
else if (command === "state") await state();
else if (command === "evidence") await evidence();
else if (command === "reset") await reset();
else finish(false, { app, command: command || "none", reason: "unknown-command" });
