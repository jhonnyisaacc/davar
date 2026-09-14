import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GREEK_RECORDED_REVISION } from "@davar/shared/greekBesorah";

const webRoot = join(import.meta.dir, "..");
const publicDataDir = join(webRoot, "public", "data");
const metadataPath = join(publicDataDir, "metadata.json");

const requiredTs2009Files = [
	join(publicDataDir, "ts2009", "matthew", "1.json"),
	join(publicDataDir, "ts2009", "galatians", "1.json"),
	join(publicDataDir, "ts2009", "john1", "1.json"),
	join(publicDataDir, "ts2009", "jude", "1.json"),
	join(publicDataDir, "ts2009", "revelation", "1.json"),
];
const requiredHutterFiles = [
	join(publicDataDir, "hutter", "matthew", "1.json"),
	join(publicDataDir, "hutter", "revelation", "22.json"),
];

const hasRequiredTs2009Coverage = (): boolean =>
	requiredTs2009Files.every((path) => existsSync(path));
const hasRequiredHutterCoverage = (): boolean =>
	requiredHutterFiles.every((path) => existsSync(path));

if (
	existsSync(metadataPath) &&
	hasRequiredTs2009Coverage() &&
	hasRequiredHutterCoverage()
) {
	console.log("[davar-web] static-data=present skip-generation");
} else {
	if (!existsSync(metadataPath)) {
		console.log("[davar-web] static-data=missing generating");
	} else {
		console.log("[davar-web] static-data=incomplete regenerating");
	}

	const generation = Bun.spawnSync(
		["bun", "../scripts/generate-static-data/index.ts"],
		{
			cwd: webRoot,
			stdout: "inherit",
			stderr: "inherit",
		},
	);

	if (generation.exitCode !== 0) {
		console.error("[davar-web] static-data=generate failed");
		process.exit(generation.exitCode ?? 1);
	}
}

const greekManifestPath = join(publicDataDir, "greek", "manifest.json");
const isCurrentGreekPreview = (): boolean => {
	if (!existsSync(greekManifestPath)) return false;
	try {
		const manifest = JSON.parse(readFileSync(greekManifestPath, "utf-8")) as {
			revision?: string;
			complete?: boolean;
			validated?: boolean;
		};
		return (
			manifest.revision === GREEK_RECORDED_REVISION &&
			manifest.complete === true &&
			manifest.validated === true
		);
	} catch {
		return false;
	}
};
const shouldPublishGreekPreview =
	process.env.PUBLIC_GREEK_PREVIEW_ENABLED !== "0";

if (shouldPublishGreekPreview && !isCurrentGreekPreview()) {
	console.log("[davar-web] greek-preview=missing generating");
	const greekPreview = Bun.spawnSync(
		[
			"python3",
			"-m",
			"scripts.greek",
			"publish-preview",
			"--public-data-dir",
			publicDataDir,
		],
		{
			cwd: join(webRoot, ".."),
			env: {
				...process.env,
				PYTHONPATH: ".",
				PYTHONUNBUFFERED: "1",
			},
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	if (greekPreview.exitCode !== 0) {
		console.error("[davar-web] greek-preview=generate failed");
		process.exit(greekPreview.exitCode ?? 1);
	}
}

console.log("[davar-web] static-data=ready");
