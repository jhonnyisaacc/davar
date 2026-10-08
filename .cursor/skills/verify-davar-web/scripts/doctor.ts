const port = Number(process.env.DAVAR_VERIFY_PORT ?? 5193);
const htmlPort = Number(process.env.DAVAR_VERIFY_HTML_PORT ?? 5194);
const origin = `http://127.0.0.1:${port}`;
const pidFile = new URL("../run/server.pid", import.meta.url);

const fail = (message: string): never => {
	console.error(`doctor: ${message}`);
	process.exit(1);
};

const responseText = async (path: string): Promise<string> => {
	let response: Response;
	try {
		response = await fetch(`${origin}${path}`);
	} catch (error) {
		fail(`${origin}${path} did not answer (${String(error)})`);
	}
	if (!response.ok) {
		fail(`${origin}${path} returned ${response.status}`);
	}
	return response.text();
};

const html = await responseText("/verse/Genesis/1/1");
if (!html.includes("<title>Davar | Hebrew Scriptures</title>")) {
	fail("HTML title is not Davar | Hebrew Scriptures");
}

const metadata = JSON.parse(await responseText("/data/metadata.json")) as {
	books?: { name?: string }[];
};
if (metadata.books?.[0]?.name !== "Genesis") {
	fail("/data/metadata.json does not list Genesis first");
}

const pidText = await Bun.file(pidFile).text().catch(() => "");
const pid = Number(pidText.trim());
if (!Number.isInteger(pid) || pid <= 0) {
	fail(`missing pid in ${pidFile.pathname}`);
}

const alive = Bun.spawnSync(["kill", "-0", String(pid)], {
	stdout: "pipe",
	stderr: "pipe",
});
if (alive.exitCode !== 0) {
	fail(`pid ${pid} is not running`);
}

const listeners = Bun.spawnSync(
	["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
	{ stdout: "pipe", stderr: "pipe" },
);
const listenerPids = new TextDecoder()
	.decode(listeners.stdout)
	.split("\n")
	.map((line) => Number(line.trim()))
	.filter((value) => Number.isInteger(value) && value > 0);

const parentOf = (child: number): number => {
	const result = Bun.spawnSync(["ps", "-o", "ppid=", "-p", String(child)], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return Number(new TextDecoder().decode(result.stdout).trim());
};

const ownsListener = (listener: number): boolean => {
	let current = listener;
	for (let depth = 0; depth < 8 && current > 1; depth += 1) {
		if (current === pid) return true;
		current = parentOf(current);
	}
	return false;
};

if (!listenerPids.some(ownsListener)) {
	fail(
		`pid ${pid} does not own the listener on ${port} (listeners: ${listenerPids.join(", ") || "none"})`,
	);
}

console.log(
	`doctor: ok origin=${origin} html-port=${htmlPort} pid=${pid} title=Davar | Hebrew Scriptures genesis=listed`,
);
