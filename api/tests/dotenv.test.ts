import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageJson = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: { dev: string; start: string } };

function scriptFor(name: "dev" | "start"): string {
	const script = packageJson.scripts[name];
	expect(script).not.toContain("--env-file");
	expect(script).not.toContain("--no-env-file");
	expect(script).not.toContain(".env.development");
	expect(script).not.toContain(".env.local");
	if (!script.includes("./src/index.ts")) {
		throw new Error(`${name} script does not launch ./src/index.ts`);
	}
	return script.replaceAll(" --watch", "").replaceAll("./src/index.ts", "./probe.ts");
}

function writeProbe(directory: string): void {
	writeFileSync(
		join(directory, "package.json"),
		JSON.stringify({
			scripts: {
				dev: scriptFor("dev"),
				start: scriptFor("start"),
			},
		}),
	);
	writeFileSync(
		join(directory, "probe.ts"),
		"console.log(JSON.stringify({dotenv:process.env.DOTENV_SENTINEL??null}))",
	);
}

function childEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
	const env: Record<string, string> = {};
	if (process.env.PATH) env.PATH = process.env.PATH;
	if (process.env.HOME) env.HOME = process.env.HOME;
	for (const [key, value] of Object.entries(extra)) {
		if (value !== undefined) env[key] = value;
	}
	return env;
}

function run(
	directory: string,
	script: "dev" | "start",
	extra: Record<string, string | undefined>,
): { dotenv: string | null } {
	const result = spawnSync("bun", ["run", script], {
		cwd: directory,
		env: childEnv(extra),
		encoding: "utf8",
	});
	expect(result.status, result.stderr || result.stdout).toBe(0);
	const line = result.stdout
		.split("\n")
		.map((entry) => entry.trim())
		.filter((entry) => entry.startsWith("{"))
		.at(-1);
	expect(line).toBeTruthy();
	return JSON.parse(line ?? "{}");
}

describe("dotenv", () => {
	test("dev and start load .env and an export wins", () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-dotenv-"));
		try {
			writeProbe(directory);
			writeFileSync(join(directory, ".env"), "DOTENV_SENTINEL=from-dotenv\n");
			expect(run(directory, "dev", {}).dotenv).toBe("from-dotenv");
			expect(run(directory, "start", {}).dotenv).toBe("from-dotenv");
			expect(run(directory, "dev", { DOTENV_SENTINEL: "from-export" }).dotenv).toBe("from-export");
			expect(run(directory, "start", { DOTENV_SENTINEL: "from-export" }).dotenv).toBe("from-export");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
