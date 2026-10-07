import { fileURLToPath } from "node:url";

type RuntimeProcess = {
	env: Record<string, string | undefined>;
	on: (signal: "SIGINT" | "SIGTERM", listener: () => void) => void;
	exit: (exitCode: number) => never;
};

const runtimeProcess = process as unknown as RuntimeProcess;
const runtimeEnv = runtimeProcess.env;
const runtimeExit = (code: number): never => {
	return runtimeProcess.exit(code);
};

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const appPort = Number(runtimeEnv.PORT ?? 5173);
const appHost = runtimeEnv.HOST ?? "0.0.0.0";
const htmlPort = Number(runtimeEnv.HOT_HTML_PORT ?? 5174);
// Keep the gateway enabled by default so /data JSON is always served in hot mode.
const useGateway = runtimeEnv.HOT_USE_GATEWAY !== "0";
// Prefer same-origin data fetches so LAN/mobile clients do not
// get pinned to localhost. HOT_STATIC_URL can still force an absolute base.
const staticUrl = runtimeEnv.HOT_STATIC_URL ?? "";

console.log(
	`[davar-web] dev:hot app-host=${appHost} app-port=${appPort} html-port=${htmlPort} static-base=${staticUrl || "(same-origin)"} gateway=${useGateway ? "on" : "off"}`,
);

if (useGateway) {
	console.log(
		`[davar-web] browse http://localhost:${appPort} (hot-reload upstream http://localhost:${htmlPort} also serves /data/* and /api/ts2009/*)`,
	);
}

const ensure = Bun.spawnSync(["bun", "./scripts/ensure-static-data.ts"], {
	cwd: webRoot,
	stdout: "inherit",
	stderr: "inherit",
});

if (ensure.exitCode !== 0) {
	runtimeExit(ensure.exitCode ?? 1);
}

const htmlServer = Bun.spawn(
	["bun", "--env-file=.env", "./scripts/dev-hot-html.ts"],
	{
		cwd: webRoot,
		env: {
			...runtimeEnv,
			PORT: String(useGateway ? htmlPort : appPort),
			HOST: appHost,
			PUBLIC_STATIC_URL: staticUrl,
		},
		stdout: "inherit",
		stderr: "inherit",
	},
);

const gatewayServer = useGateway
	? Bun.spawn(["bun", "./scripts/dev-hot-gateway.ts"], {
			cwd: webRoot,
			env: {
				...runtimeEnv,
				PORT: String(appPort),
				HOST: appHost,
				HOT_HTML_PORT: String(htmlPort),
				HOT_HTML_HOST: "localhost",
			},
			stdout: "inherit",
			stderr: "inherit",
		})
	: null;

const shutdown = () => {
	if (!htmlServer.killed) {
		htmlServer.kill();
	}
	if (gatewayServer && !gatewayServer.killed) {
		gatewayServer.kill();
	}
};

runtimeProcess.on("SIGINT", () => {
	shutdown();
	runtimeExit(0);
});

runtimeProcess.on("SIGTERM", () => {
	shutdown();
	runtimeExit(0);
});

const serverExitCode = await Promise.race([
	htmlServer.exited,
	...(gatewayServer ? [gatewayServer.exited] : []),
]);
shutdown();
runtimeExit(serverExitCode);
