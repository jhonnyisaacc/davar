import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "bun:test";
import type postgres from "postgres";
import { createDb } from "../src/db/client.js";
import {
	assertMigrationsApplied,
	pendingMigrationNames,
	PendingMigrationError,
} from "../src/db/pending.js";
import { logDevelopmentJob } from "../src/lib/jobLog.js";
import { formatQueryLog } from "../src/lib/queryLog.js";
import {
	makeTestContext,
	testConfig,
	testDb,
	TEST_DATABASE_URL,
	truncateAll,
} from "./helper.js";

beforeEach(truncateAll);

const packageJson = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: { dev: string; start: string } };

function captureLog(run: () => void): string[] {
	const lines: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(" "));
	};
	try {
		run();
	} finally {
		console.log = original;
	}
	return lines;
}

function scriptedSql(handler: () => Promise<Array<{ name: unknown }>>): postgres.Sql {
	return (async () => handler()) as unknown as postgres.Sql;
}

describe("development reload", () => {
	test("dev watches and start does not", () => {
		expect(packageJson.scripts.dev).toBe(
			"bun --watch --no-env-file --env-file=.env --env-file=.env.development --env-file=.env.local --env-file=.env.development.local ./src/index.ts",
		);
		expect(packageJson.scripts.start).toBe("bun --no-env-file ./src/index.ts");
	});
});

describe("development error reports", () => {
	test("development returns the error name, message, and stack", async () => {
		const { app } = makeTestContext({
			config: { ...testConfig(), env: "development" },
		});
		app.get("/boom", () => {
			throw new Error("boom-marker");
		});
		const res = await app.request("/boom");
		expect(res.status).toBe(500);
		const body = (await res.json()) as {
			error: { code: string; name?: string; message?: string; stack?: string };
		};
		expect(body.error.code).toBe("internal_error");
		expect(body.error.name).toBe("Error");
		expect(body.error.message).toBe("boom-marker");
		expect(body.error.stack ?? "").toContain("boom-marker");
	});

	test("staging, production, and test return internal_error with no stack", async () => {
		for (const env of ["staging", "production", "test"] as const) {
			const { app } = makeTestContext({
				config: { ...testConfig(), env },
			});
			app.get("/boom", () => {
				throw new Error("boom-marker-secret");
			});
			const res = await app.request("/boom");
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({ error: { code: "internal_error" } });
		}
	});

	test("development logs stay redacted while the response shows the error", async () => {
		const { app } = makeTestContext({
			config: { ...testConfig(), env: "development" },
		});
		app.post("/api/v1/__leak__", () => {
			throw new Error("Failed query: select ...\nparams: secret-value-1");
		});
		const lines: string[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			lines.push(args.map(String).join(" "));
		};
		try {
			const res = await app.request("/api/v1/__leak__", { method: "POST" });
			expect(res.status).toBe(500);
			const body = (await res.json()) as { error: { message?: string; stack?: string } };
			expect(body.error.message).toContain("secret-value-1");
			expect(body.error.stack ?? "").toContain("secret-value-1");
		} finally {
			console.error = original;
		}
		const logged = lines.join("\n");
		expect(logged).not.toContain("secret-value-1");
		expect(logged).not.toContain("params:");
		expect(logged).toContain("request_error");
	});
});

describe("pending migrations", () => {
	test("development load fails when a migration file is pending", async () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-migrations-"));
		try {
			writeFileSync(join(directory, "9999_pending.sql"), "SELECT 1;\n");
			await expect(
				assertMigrationsApplied("development", testDb().sql, directory),
			).rejects.toThrow(PendingMigrationError);
			await expect(
				assertMigrationsApplied("development", testDb().sql, directory),
			).rejects.toThrow(/9999_pending.sql/);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("a missing schema_migrations table treats every file as pending", async () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-migrations-"));
		try {
			writeFileSync(join(directory, "0001_davar_domain.sql"), "SELECT 1;\n");
			const sql = scriptedSql(async () => {
				throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
			});
			expect(await pendingMigrationNames(sql, directory)).toEqual(["0001_davar_domain.sql"]);
			await expect(assertMigrationsApplied("development", sql, directory)).rejects.toThrow(
				/0001_davar_domain.sql/,
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("other database failures still fail the development load", async () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-migrations-"));
		try {
			const sql = scriptedSql(async () => {
				throw Object.assign(new Error("connection refused"), { code: "08006" });
			});
			await expect(assertMigrationsApplied("development", sql, directory)).rejects.toThrow(
				/connection refused/,
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("staging, production, and test do not check migrations", async () => {
		const sql = scriptedSql(async () => {
			throw new Error("should not query");
		});
		await assertMigrationsApplied("staging", sql, "/missing");
		await assertMigrationsApplied("production", sql, "/missing");
		await assertMigrationsApplied("test", sql, "/missing");
	});

	test("applied migrations let development load", async () => {
		expect(await pendingMigrationNames(testDb().sql)).toEqual([]);
		await assertMigrationsApplied("development", testDb().sql);
	});

	test("a development request fails when migrations are pending", async () => {
		const directory = mkdtempSync(join(tmpdir(), "davar-migrations-"));
		try {
			writeFileSync(join(directory, "9999_pending.sql"), "SELECT 1;\n");
			const { app } = makeTestContext({
				config: { ...testConfig(), env: "development" },
				pendingMigrations: () => pendingMigrationNames(testDb().sql, directory),
			});
			const res = await app.request("/up");
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({
				error: {
					code: "pending_migration",
					message: "Migrations are pending: 9999_pending.sql. Run bun run db:migrate.",
				},
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("staging and production requests ignore pending migrations", async () => {
		for (const env of ["staging", "production", "test"] as const) {
			const { app } = makeTestContext({
				config: { ...testConfig(), env },
				pendingMigrations: async () => {
					throw new Error("should not check");
				},
			});
			const res = await app.request("/up");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ status: "ok" });
		}
	});

	test("a pending migration error outside development has no message", async () => {
		const { app } = makeTestContext({
			config: { ...testConfig(), env: "production" },
		});
		app.get("/boom", () => {
			throw new PendingMigrationError(["0009_secret.sql"]);
		});
		const lines: string[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			lines.push(args.map(String).join(" "));
		};
		try {
			const res = await app.request("/boom");
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({ error: { code: "internal_error" } });
		} finally {
			console.error = original;
		}
		expect(lines.join("\n")).not.toContain("0009_secret.sql");
	});
});

describe("development query and job logs", () => {
	test("query logs omit bound parameters", () => {
		expect(formatQueryLog("SELECT $1::text")).toBe(
			JSON.stringify({ event: "query", query: "SELECT $1::text" }),
		);
		expect(formatQueryLog("SELECT $1::text")).not.toContain("secret-value-1");
	});

	test("development query logs include sql and omit parameters", async () => {
		const lines: string[] = [];
		const original = console.log;
		console.log = (...args: unknown[]) => {
			lines.push(args.map(String).join(" "));
		};
		const { sql } = createDb(TEST_DATABASE_URL, { verboseQueryLogs: true });
		try {
			await sql`SELECT ${"secret-value-1"}::text as marker`;
		} finally {
			console.log = original;
			await sql.end();
		}
		const logged = lines.join("\n");
		expect(logged).toContain('"event":"query"');
		expect(logged).toContain("SELECT $1::text as marker");
		expect(logged).not.toContain("secret-value-1");
	});

	test("hosted and test query logs stay quiet", async () => {
		expect(process.env.NODE_ENV).toBe("test");
		const lines: string[] = [];
		const original = console.log;
		console.log = (...args: unknown[]) => {
			lines.push(args.map(String).join(" "));
		};
		const explicit = createDb(TEST_DATABASE_URL, { verboseQueryLogs: false });
		const implicit = createDb(TEST_DATABASE_URL);
		try {
			await explicit.sql`SELECT ${"secret-value-1"}::text as marker`;
			await implicit.sql`SELECT ${"secret-value-1"}::text as marker`;
		} finally {
			console.log = original;
			await explicit.sql.end();
			await implicit.sql.end();
		}
		const logged = lines.join("\n");
		expect(logged).not.toContain('"event":"query"');
		expect(logged).not.toContain("secret-value-1");
	});

	test("development job logs name the source and hosted jobs stay quiet", () => {
		const lines = captureLog(() => {
			logDevelopmentJob("development", "recover_consultations", "src/jobs/recover.ts");
			logDevelopmentJob("staging", "recover_consultations", "src/jobs/recover.ts");
			logDevelopmentJob("production", "telegram_notifications", "src/jobs/notify.ts");
			logDevelopmentJob("test", "sync_calendar_observations", "src/jobs/calendar.ts");
		});
		expect(lines).toEqual([
			JSON.stringify({
				event: "job",
				job: "recover_consultations",
				source: "src/jobs/recover.ts",
			}),
		]);
	});
});
