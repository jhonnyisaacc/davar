#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectPage, evaluate } from "./cdp.ts";
import {
	alive,
	copyIfExists,
	ensureRunDir,
	envStrings,
	evidenceDir,
	killRecorded,
	lastAction,
	listeners,
	ownsPort,
	urlHasPath,
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

const app = "web";

type Ports = { port: number; cdp: number };

type PageState = { url: string; title: string; text: string };

function ports(): Ports {
	return (
		readJson<Ports>(app, "ports.json") ?? {
			port: Number(process.env.DAVAR_WEB_PORT ?? 5173),
			cdp: Number(process.env.DAVAR_WEB_CDP_PORT ?? 9222),
		}
	);
}

function chromeBin(): string {
	return process.env.CHROME_PATH ?? "google-chrome";
}

function commandExists(name: string): boolean {
	if (name.includes("/")) return existsSync(name);
	if (Bun.which(name)) return true;
	return existsSync(join(process.env.HOME ?? "", ".bun", "bin", name));
}

async function pageState(cdp: number): Promise<PageState> {
	const page = await connectPage(cdp);
	try {
		return await evaluate<PageState>(
			page,
			`(() => ({
				url: location.href,
				title: document.title,
				text: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 500)
			}))()`,
		);
	} finally {
		page.close();
	}
}

async function doctor(): Promise<never> {
	const { port, cdp } = ports();
	const serverPid = readPid(app, "server");
	const chromePid = readPid(app, "chrome");
	if (!alive(serverPid) || !alive(chromePid)) {
		finish(false, { app, command: "doctor", reason: "not-running" });
	}
	if (!ownsPort(serverPid as number, port)) {
		finish(false, { app, command: "doctor", reason: "port-not-ours", port });
	}
	if (!ownsPort(chromePid as number, cdp)) {
		finish(false, { app, command: "doctor", reason: "cdp-not-ours", cdp });
	}
	const version = await fetch(`http://127.0.0.1:${cdp}/json/version`);
	if (!version.ok) {
		finish(false, { app, command: "doctor", reason: "cdp-down", cdp });
	}
	finish(true, {
		app,
		command: "doctor",
		url: `http://127.0.0.1:${port}`,
		port,
		cdp,
		pid: serverPid as number,
		chrome: chromePid as number,
	});
}

async function start(): Promise<never> {
	if (!commandExists("bun")) {
		finish(false, { app, command: "start", reason: "bun-missing" });
	}
	if (!commandExists(chromeBin())) {
		finish(false, { app, command: "start", reason: "chrome-missing" });
	}
	const port = Number(process.env.DAVAR_WEB_PORT ?? 5173);
	const htmlPort = port + 1;
	const cdp = Number(process.env.DAVAR_WEB_CDP_PORT ?? 9222);
	if (!Number.isInteger(port) || port < 1 || htmlPort > 65535) {
		finish(false, { app, command: "start", reason: "port-invalid", port });
	}
	if (alive(readPid(app, "server")) || alive(readPid(app, "chrome"))) {
		finish(false, { app, command: "start", reason: "already-running" });
	}
	if (listeners(port).length > 0) {
		finish(false, { app, command: "start", reason: "port-busy", port });
	}
	if (listeners(cdp).length > 0) {
		finish(false, { app, command: "start", reason: "cdp-busy", cdp });
	}
	if (listeners(htmlPort).length > 0) {
		finish(false, { app, command: "start", reason: "html-port-busy", port: htmlPort });
	}
	const dir = ensureRunDir(app);
	const envPath = join(repoRoot, "web", ".env");
	if (!existsSync(envPath)) {
		const example = join(repoRoot, "web", ".env.example");
		if (!existsSync(example)) {
			finish(false, { app, command: "start", reason: "env-missing" });
		}
		writeFileSync(envPath, readFileSync(example));
		writeFileSync(join(dir, "created-env"), "web/.env\n");
	}
	writeJson(app, "ports.json", { port, cdp });
	const serverLog = join(dir, "server.log");
	writeFileSync(serverLog, "");
	const serverPid = spawnLogged(
		["bun", "run", "dev"],
		join(repoRoot, "web"),
		envStrings({
			PORT: String(port),
			HOT_HTML_PORT: String(htmlPort),
			HOST: "127.0.0.1",
			PUBLIC_NODE_ENV: "development",
		}),
		serverLog,
	);
	writePid(app, "server", serverPid);
	const ready = await waitUntil(
		() => ownsPort(serverPid, port),
		480000,
		() => alive(serverPid),
	);
	if (ready !== "ok") {
		await killRecorded(app, ["server"]);
		finish(false, {
			app,
			command: "start",
			reason: ready === "exited" ? "server-exited" : "start-timeout",
			log: serverLog,
		});
	}
	const profile = join(dir, "chrome-profile");
	removeTree(profile);
	const chromeLog = join(dir, "chrome.log");
	writeFileSync(chromeLog, "");
	const chromePid = spawnLogged(
		[
			chromeBin(),
			"--headless=new",
			"--disable-gpu",
			"--no-sandbox",
			"--disable-dev-shm-usage",
			`--remote-debugging-port=${cdp}`,
			"--remote-debugging-address=127.0.0.1",
			`--user-data-dir=${profile}`,
			"--window-size=390,844",
			"--no-first-run",
			"--no-default-browser-check",
			"about:blank",
		],
		dir,
		envStrings({}),
		chromeLog,
	);
	writePid(app, "chrome", chromePid);
	const cdpReady = await waitUntil(
		async () => {
			if (!ownsPort(chromePid, cdp)) return false;
			try {
				const response = await fetch(`http://127.0.0.1:${cdp}/json/version`);
				return response.ok;
			} catch {
				return false;
			}
		},
		20000,
		() => alive(chromePid),
	);
	if (cdpReady !== "ok") {
		await killRecorded(app, ["server", "chrome"]);
		finish(false, {
			app,
			command: "start",
			reason: cdpReady === "exited" ? "chrome-exited" : "cdp-timeout",
			log: chromeLog,
		});
	}
	finish(true, {
		app,
		command: "start",
		url: `http://127.0.0.1:${port}`,
		port,
		cdp,
		pid: serverPid,
		chrome: chromePid,
	});
}

async function stop(): Promise<never> {
	const stopped = await killRecorded(app, ["server", "chrome"]);
	finish(true, { app, command: "stop", stopped });
}

async function drive(args: string[]): Promise<never> {
	const { port, cdp } = ports();
	if (!alive(readPid(app, "chrome")) || !ownsPort(readPid(app, "chrome") as number, cdp)) {
		finish(false, { app, command: "drive", reason: "not-running" });
	}
	const action = args[0] ?? "";
	if (action === "open") {
		const path = args[1] ?? "";
		if (!path.startsWith("/") || path.startsWith("//")) {
			finish(false, { app, command: "drive", reason: "path-required" });
		}
		const url = `http://127.0.0.1:${port}${path}`;
		const nav = await connectPage(cdp);
		try {
			await nav.send("Page.navigate", { url });
		} finally {
			nav.close();
		}
		let seen = url;
		const loaded = await waitUntil(async () => {
			try {
				const state = await pageState(cdp);
				seen = state.url;
				return urlHasPath(state.url, path) && state.text.length > 0;
			} catch {
				return false;
			}
		}, 45000);
		if (loaded !== "ok") {
			finish(false, { app, command: "drive", reason: "load-timeout", url: seen });
		}
		rememberAction(app, `open ${path}`);
		const state = await pageState(cdp);
		finish(true, { app, command: "drive", action: "open", url: state.url, text: state.text });
	}
	const page = await connectPage(cdp);
	try {
		if (action === "click") {
			const name = args.slice(1).join(" ").trim();
			if (!name) finish(false, { app, command: "drive", reason: "name-required" });
			const clicked = await evaluate<{ ok: boolean }>(
				page,
				`(() => {
					const wanted = ${JSON.stringify(name)};
					const nodes = Array.from(document.querySelectorAll("button, a, [role='button']"));
					const match = nodes.find((node) => {
						const label = (node.getAttribute("aria-label") || node.textContent || "").replace(/\\s+/g, " ").trim();
						return label === wanted;
					});
					if (!(match instanceof HTMLElement)) return { ok: false };
					match.click();
					return { ok: true };
				})()`,
			);
			if (!clicked.ok) {
				finish(false, { app, command: "drive", reason: "control-not-found", name });
			}
			await Bun.sleep(800);
			rememberAction(app, `click ${name}`);
			const state = await evaluate<PageState>(
				page,
				`(() => ({
					url: location.href,
					title: document.title,
					text: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 300)
				}))()`,
			);
			finish(true, {
				app,
				command: "drive",
				action: "click",
				name,
				url: state.url,
				text: state.text,
			});
		}
		finish(false, { app, command: "drive", reason: "unknown-action" });
	} finally {
		page.close();
	}
}

async function state(): Promise<never> {
	const { cdp } = ports();
	if (!alive(readPid(app, "chrome"))) {
		finish(false, { app, command: "state", reason: "not-running" });
	}
	const current = await pageState(cdp);
	finish(true, { app, command: "state", url: current.url, title: current.title, text: current.text });
}

async function evidence(): Promise<never> {
	const { cdp } = ports();
	if (!alive(readPid(app, "chrome"))) {
		finish(false, { app, command: "evidence", reason: "not-running" });
	}
	const page = await connectPage(cdp);
	try {
		const current = await evaluate<PageState>(
			page,
			`(() => ({
				url: location.href,
				title: document.title,
				text: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 500)
			}))()`,
		);
		const shot = await page.send("Page.captureScreenshot", { format: "png" });
		const dir = evidenceDir(app, lastAction(app));
		writeFileSync(join(dir, "screenshot.png"), Buffer.from(String(shot.data), "base64"));
		writeFileSync(join(dir, "state.txt"), `url ${current.url}\ntitle ${current.title}\ntext ${current.text}\n`);
		copyIfExists(join(runDir(app), "transcript.txt"), join(dir, "transcript.txt"));
		finish(true, { app, command: "evidence", path: dir, url: current.url });
	} finally {
		page.close();
	}
}

async function reset(): Promise<never> {
	const marker = join(runDir(app), "created-env");
	const created = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "";
	await killRecorded(app, ["server", "chrome"]);
	removeTree(runDir(app));
	if (created === "web/.env") {
		const envPath = join(repoRoot, "web", ".env");
		if (existsSync(envPath)) removeTree(envPath);
	}
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
