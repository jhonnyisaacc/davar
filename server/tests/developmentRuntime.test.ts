import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const packageJson = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: { dev: string; start: string } };

describe("development runtime", () => {
	test("dev watches and start does not", () => {
		expect(packageJson.scripts.dev).toBe("bun --watch ./src/index.ts");
		expect(packageJson.scripts.start).toBe("bun ./src/index.ts");
		expect(packageJson.scripts.dev).not.toContain("--env-file");
		expect(packageJson.scripts.start).not.toContain("--no-env-file");
	});
});
