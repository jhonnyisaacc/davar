import { describe, expect, test } from "bun:test";

describe("hosted boot", () => {
	test("exits non-zero when the env schema fails", async () => {
		const proc = Bun.spawn({
			cmd: ["bun", "--no-env-file", "./src/index.ts"],
			cwd: new URL("..", import.meta.url).pathname,
			env: {
				PATH: process.env.PATH ?? "",
				NODE_ENV: "production",
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		const code = await Promise.race([
			proc.exited,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => {
					proc.kill();
					resolve(null);
				}, 8000);
			}),
		]);
		if (timer) clearTimeout(timer);
		const stderr = await new Response(proc.stderr).text();
		expect(code).not.toBe(null);
		expect(code).not.toBe(0);
		expect(stderr).toContain("DAVAR_ENCRYPTION_PRIMARY_KEY is required");
	});

	test("exits non-zero when API_HOSTS parses to no hosts", async () => {
		const proc = Bun.spawn({
			cmd: ["bun", "--no-env-file", "./src/index.ts"],
			cwd: new URL("..", import.meta.url).pathname,
			env: {
				PATH: process.env.PATH ?? "",
				NODE_ENV: "production",
				DATABASE_URL: "postgresql://127.0.0.1/davar_v2_production",
				DAVAR_ENCRYPTION_PRIMARY_KEY: "a".repeat(32),
				DAVAR_ENCRYPTION_DETERMINISTIC_KEY: "b".repeat(32),
				API_PUBLIC_URL: "https://api.example.org",
				API_HOSTS: ",",
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		const code = await Promise.race([
			proc.exited,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => {
					proc.kill();
					resolve(null);
				}, 8000);
			}),
		]);
		if (timer) clearTimeout(timer);
		const stderr = await new Response(proc.stderr).text();
		expect(code).not.toBe(null);
		expect(code).not.toBe(0);
		expect(stderr).toContain("Missing production configuration: API_HOSTS");
	});
});
