import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("sandbox seed and reset", () => {
	test("seed and reset are bun scripts", async () => {
		const pkg = await Bun.file(join(SERVER_ROOT, "package.json")).json();
		expect(pkg.scripts["sandbox:seed"]).toBe("bun ./src/jobs/sandbox-seed.ts");
		expect(pkg.scripts["sandbox:reset"]).toBe("bun ./src/jobs/sandbox-reset.ts");
		expect(existsSync(join(SERVER_ROOT, "src/jobs/sandbox-seed.ts"))).toBe(true);
		expect(existsSync(join(SERVER_ROOT, "src/jobs/sandbox-reset.ts"))).toBe(true);
		expect(existsSync(join(SERVER_ROOT, "bin/dev-sandbox"))).toBe(false);
		expect(pkg.scripts.ios).toBeUndefined();
	});
});
