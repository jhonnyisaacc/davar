import {
	cpSync,
	existsSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import tailwind from "bun-plugin-tailwind";

type RuntimeProcess = {
	env: Record<string, string | undefined>;
	exit: (exitCode: number) => never;
};

const runtimeProcess = process as unknown as RuntimeProcess;
const runtimeExit = (code: number): never => runtimeProcess.exit(code);
const publicDir = join(import.meta.dir, "public");
const distDir = join(import.meta.dir, "dist");

const formatSeconds = (startedAtMs: number): string => {
	return `${((Date.now() - startedAtMs) / 1000).toFixed(1)}s`;
};

const buildStartedAt = Date.now();
console.log("[davar-web] phase=data-generation start");
const dataGenerationStartedAt = Date.now();

const generation = Bun.spawnSync(
	["bun", "../scripts/generate-static-data/index.ts"],
	{
		cwd: import.meta.dir,
		env: {
			...process.env,
			EXPORT_TS2009_STATIC: process.env.EXPORT_TS2009_STATIC ?? "0",
		},
		stdout: "inherit",
		stderr: "inherit",
	},
);

if (generation.exitCode === 0) {
	console.log(
		`[davar-web] phase=data-generation done duration=${formatSeconds(dataGenerationStartedAt)}`,
	);
}

if (generation.exitCode !== 0) {
	console.error(
		`[davar-web] phase=data-generation failed duration=${formatSeconds(dataGenerationStartedAt)}`,
	);
	runtimeExit(generation.exitCode ?? 1);
}

const greekPreviewEnabled =
	process.env.PUBLIC_GREEK_PREVIEW_ENABLED === "1" ||
	process.env.CF_PAGES_BRANCH === "feat/greek_besorah";

if (greekPreviewEnabled) {
	console.log("[davar-web] phase=greek-preview start");
	const greekPreviewStartedAt = Date.now();
	const greekPreview = Bun.spawnSync(
		[
			"python3",
			"-m",
			"scripts.greek",
			"publish-preview",
			"--public-data-dir",
			join(publicDir, "data"),
		],
		{
			cwd: join(import.meta.dir, ".."),
			env: {
				...process.env,
				PYTHONPATH: ".",
			},
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	if (greekPreview.exitCode !== 0) {
		console.error(
			`[davar-web] phase=greek-preview failed duration=${formatSeconds(greekPreviewStartedAt)}`,
		);
		runtimeExit(greekPreview.exitCode ?? 1);
	}
	console.log(
		`[davar-web] phase=greek-preview done duration=${formatSeconds(greekPreviewStartedAt)}`,
	);
}

console.log("[davar-web] phase=bundle start");
const bundleStartedAt = Date.now();
rmSync(distDir, { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: ["./index.html"],
	outdir: "./dist",
	publicPath: "/",
	minify: true,
	env: "PUBLIC_*",
	// Belt-and-suspenders: force literal substitution of PUBLIC_* env vars so
	// that import.meta.env.PUBLIC_X is guaranteed to be inlined even in Bun
	// versions that only replace direct AST-node patterns.
	define: {
		"import.meta.env.PUBLIC_NODE_ENV": JSON.stringify(
			process.env.PUBLIC_NODE_ENV ?? "production",
		),
		"import.meta.env.PUBLIC_STATIC_URL": JSON.stringify(
			process.env.PUBLIC_STATIC_URL ?? "",
		),
		"import.meta.env.PUBLIC_GREEK_PREVIEW_ENABLED": JSON.stringify(
			greekPreviewEnabled ? "1" : "0",
		),
		"import.meta.env.PUBLIC_GREEK_PUBLIC_ENABLED": JSON.stringify("0"),
	},
	plugins: [tailwind],
});

if (!result.success) {
	console.error(
		`[davar-web] phase=bundle failed duration=${formatSeconds(bundleStartedAt)}`,
	);
	for (const log of result.logs) {
		console.error(log);
	}
	runtimeExit(1);
}

console.log(
	`[davar-web] phase=bundle done duration=${formatSeconds(bundleStartedAt)} outputs=${result.outputs.length}`,
);

// Copy public assets that aren't referenced in HTML/CSS (og-image, etc.)
if (existsSync(publicDir)) {
	cpSync(publicDir, distDir, { recursive: true, force: true });
}

rmSync(join(distDir, "data", "bundles", "ts2009.json"), {
	force: true,
});

console.log("[davar-web] phase=assets done");

// Ensure deep-route reloads request bundled assets from root (e.g. /chunk-*.js)
// instead of route-relative paths (e.g. /verse/.../chunk-*.js).
const distIndexPath = join(distDir, "index.html");
if (existsSync(distIndexPath)) {
	const html = readFileSync(distIndexPath, "utf-8");
	const normalizedHtml = html.replace(/(href|src)="\.\/([^"]+)"/g, '$1="/$2"');

	if (normalizedHtml !== html) {
		writeFileSync(distIndexPath, normalizedHtml, "utf-8");
	}
}

console.log(
	`[davar-web] phase=build done duration=${formatSeconds(buildStartedAt)} files=${result.outputs.length}`,
);
