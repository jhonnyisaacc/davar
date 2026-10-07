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
	if (!script.includes("./src/index.ts")) {
		throw new Error(`${name} script does not launch ./src/index.ts`);
	}
	return script.replaceAll("./src/index.ts", "./probe.ts");
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
		"console.log(JSON.stringify({key:process.env.OPENROUTER_API_KEY??null,model:process.env.OPENROUTER_MODEL??null,dotenv:process.env.DOTENV_SENTINEL??null,development:process.env.DEVELOPMENT_SENTINEL??null,local:process.env.LOCAL_SENTINEL??null,developmentLocal:process.env.DEVELOPMENT_LOCAL_SENTINEL??null,staging:process.env.STAGING_SENTINEL??null,production:process.env.PRODUCTION_SENTINEL??null}))",
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
): {
	key: string | null;
	model: string | null;
	dotenv: string | null;
	development: string | null;
	local: string | null;
	developmentLocal: string | null;
	staging: string | null;
	production: string | null;
} {
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

describe("development dotenv", () => {
	test("loads .env.development and preserves exported overrides", () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-dotenv-"));
		try {
			writeProbe(directory);
			writeFileSync(
				join(directory, ".env.development"),
				"OPENROUTER_API_KEY=development-file-key\nOPENROUTER_MODEL=fixture/file-model:free\n",
			);
			for (const override of [undefined, "fixture/exported-model:free"]) {
				const result = run(directory, "dev", {
					NODE_ENV: "development",
					OPENROUTER_MODEL: override,
				});
				expect(result.key).toBe("development-file-key");
				expect(result.model).toBe(override ?? "fixture/file-model:free");
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("later development files win and hosted files stay unread", () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-dotenv-"));
		try {
			writeProbe(directory);
			writeFileSync(
				join(directory, ".env"),
				"DOTENV_SENTINEL=from-dotenv\nOPENROUTER_MODEL=from-dotenv\nOPENROUTER_API_KEY=from-dotenv\n",
			);
			writeFileSync(
				join(directory, ".env.development"),
				"DEVELOPMENT_SENTINEL=from-development\nOPENROUTER_MODEL=from-development\nOPENROUTER_API_KEY=development-file-key\n",
			);
			writeFileSync(
				join(directory, ".env.local"),
				"LOCAL_SENTINEL=from-local\nOPENROUTER_MODEL=from-local\n",
			);
			writeFileSync(
				join(directory, ".env.development.local"),
				"DEVELOPMENT_LOCAL_SENTINEL=from-development-local\nOPENROUTER_MODEL=from-development-local\n",
			);
			writeFileSync(join(directory, ".env.staging"), "STAGING_SENTINEL=from-staging\n");
			writeFileSync(join(directory, ".env.production"), "PRODUCTION_SENTINEL=from-production\n");
			const result = run(directory, "dev", { NODE_ENV: "production" });
			expect(result.dotenv).toBe("from-dotenv");
			expect(result.development).toBe("from-development");
			expect(result.local).toBe("from-local");
			expect(result.developmentLocal).toBe("from-development-local");
			expect(result.key).toBe("development-file-key");
			expect(result.model).toBe("from-development-local");
			expect(result.staging).toBeNull();
			expect(result.production).toBeNull();
			const exported = run(directory, "dev", {
				NODE_ENV: "development",
				OPENROUTER_MODEL: "fixture/exported-model:free",
			});
			expect(exported.model).toBe("fixture/exported-model:free");
			expect(exported.key).toBe("development-file-key");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

describe("hosted dotenv", () => {
	test("staging and production ignore dotenv", () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-dotenv-"));
		try {
			writeProbe(directory);
			writeFileSync(join(directory, ".env"), "DOTENV_SENTINEL=from-dotenv\nOPENROUTER_API_KEY=from-dotenv\n");
			writeFileSync(
				join(directory, ".env.development"),
				"DEVELOPMENT_SENTINEL=from-development\nOPENROUTER_MODEL=from-development\n",
			);
			writeFileSync(join(directory, ".env.local"), "LOCAL_SENTINEL=from-local\n");
			writeFileSync(
				join(directory, ".env.development.local"),
				"DEVELOPMENT_LOCAL_SENTINEL=from-development-local\n",
			);
			writeFileSync(join(directory, ".env.staging"), "STAGING_SENTINEL=from-staging\n");
			writeFileSync(join(directory, ".env.production"), "PRODUCTION_SENTINEL=from-production\n");
			for (const name of ["staging", "production"]) {
				const result = run(directory, "start", { NODE_ENV: name });
				expect(result.key).toBeNull();
				expect(result.model).toBeNull();
				expect(result.dotenv).toBeNull();
				expect(result.development).toBeNull();
				expect(result.local).toBeNull();
				expect(result.developmentLocal).toBeNull();
				expect(result.staging).toBeNull();
				expect(result.production).toBeNull();
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
