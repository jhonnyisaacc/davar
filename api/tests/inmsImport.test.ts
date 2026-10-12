import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { testDb, truncateAll } from "./helper.js";
import { parseInmsObservations } from "../src/services/imports.js";
import { runControl, runInmsImport } from "../src/cli/control.js";

const fixturePath = join(import.meta.dir, "fixtures", "inms-feed.xml");
const controlPath = join(import.meta.dir, "../../scripts/control/index.ts");

beforeEach(truncateAll);

describe("INMS import", () => {
	test("recorded backfill rows match the observation schema", () => {
		const raw = JSON.parse(
			readFileSync(join(import.meta.dir, "../config/calendar_observation_backfill.json"), "utf8"),
		) as { observations: unknown[] };
		const rows = parseInmsObservations(raw.observations);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			source: "israeli_new_moon_society",
			country: "IL",
			visibility_method: "unaided",
			observed_on: "2026-03-20",
		});
	});

	test("rejects a payload that is not an INMS observation", () => {
		expect(() => parseInmsObservations([{ id: "not-an-observation" }])).toThrow(
			"calendar_feed_malformed",
		);
	});

	test("the control command imports a recorded fixture twice without calling INMS", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () => {
			throw new Error("live INMS fetch");
		}) as unknown as typeof fetch;
		const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };
		const count = async () =>
			(
				(await testDb().db.execute(
					sql`SELECT count(*)::int AS count FROM new_moon_observations`,
				))[0] as { count: number }
			).count;
		try {
			const { db } = testDb();
			const first = await runInmsImport(db, { fixture: fixturePath, env });
			expect(first).toMatchObject({ status: "ok", observations: 1 });
			expect(await count()).toBe(1);
			const second = await runInmsImport(db, { fixture: fixturePath, env });
			expect(second).toMatchObject({ status: "ok", observations: 0 });
			expect(await count()).toBe(1);
			expect(await runControl(["import", "inms", "--fixture", fixturePath], env)).toBe(0);
			expect(await count()).toBe(1);

			const proc = Bun.spawn(
				[process.execPath, controlPath, "import", "inms", "--fixture", fixturePath],
				{
					cwd: join(import.meta.dir, "../.."),
					env: {
						...env,
						http_proxy: "http://127.0.0.1:9",
						https_proxy: "http://127.0.0.1:9",
						HTTP_PROXY: "http://127.0.0.1:9",
						HTTPS_PROXY: "http://127.0.0.1:9",
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const [out, err, code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			expect({ code, out, err }).toMatchObject({ code: 0 });
			expect(JSON.parse(out).status).toBe("ok");
			expect(await count()).toBe(1);
		} finally {
			globalThis.fetch = original;
		}
	});

	test("unknown control arguments do not import", async () => {
		expect(await runControl(["import", "inms", "--live"], process.env)).toBe(1);
		const count = (
			(await testDb().db.execute(
				sql`SELECT count(*)::int AS count FROM new_moon_observations`,
			))[0] as { count: number }
		).count;
		expect(count).toBe(0);
	});
});
