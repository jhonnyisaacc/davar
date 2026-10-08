import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { JOBS, syncCalendarObservations } from "../src/jobs/functions.js";
import { parseControlArgs } from "../src/cli/control.js";
import {
	dueNames,
	emptyState,
	ONE_MINUTE_MS,
	SCHEDULE,
	schedulerEnabled,
	THIRTY_MINUTES_MS,
	tick,
	type ScheduledJob,
} from "../src/scheduler.js";
import { testDb, truncateAll } from "./helper.js";

const recordedAt = Date.parse("2026-10-07T00:00:00Z");
const recordedFeed = readFileSync(new URL("./fixtures/inms-feed.xml", import.meta.url), "utf8");

beforeEach(truncateAll);

function stubSchedule(calls: string[]): ScheduledJob[] {
	return SCHEDULE.map((job) => ({
		...job,
		run: async () => {
			calls.push(job.name);
		},
	}));
}

describe("scheduler", () => {
	test("a recorded tick runs each due job once", async () => {
		const calls: string[] = [];
		const schedule = stubSchedule(calls);
		const deps = {
			db: testDb().db,
			env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
			primaryKey: "test-primary",
			previousKeys: [] as string[],
		};
		const first = await tick(recordedAt, emptyState(), deps, schedule);
		expect(first.ran).toEqual([
			"sync_calendar_observations",
			"recover_consultations",
			"telegram_notifications",
		]);
		expect(first.failed).toEqual([]);
		expect(calls).toEqual(first.ran);

		const again = await tick(recordedAt, first.state, deps, schedule);
		expect(again.ran).toEqual([]);
		expect(calls).toHaveLength(3);

		const minuteLater = await tick(recordedAt + ONE_MINUTE_MS, again.state, deps, schedule);
		expect(minuteLater.ran).toEqual(["recover_consultations", "telegram_notifications"]);
		expect(dueNames(recordedAt + ONE_MINUTE_MS, again.state, schedule)).toEqual(minuteLater.ran);

		const halfHourLater = await tick(
			recordedAt + THIRTY_MINUTES_MS,
			minuteLater.state,
			deps,
			schedule,
		);
		expect(halfHourLater.ran).toEqual([
			"sync_calendar_observations",
			"recover_consultations",
			"telegram_notifications",
		]);
	});

	test("a failed job stays due on the next tick", async () => {
		let attempts = 0;
		const schedule: ScheduledJob[] = [
			{
				name: "recover_consultations",
				everyMs: ONE_MINUTE_MS,
				run: async () => {
					attempts += 1;
					if (attempts === 1) throw new Error("boom");
				},
			},
		];
		const deps = {
			db: testDb().db,
			env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
			primaryKey: "test-primary",
			previousKeys: [] as string[],
		};
		const failed = await tick(recordedAt, emptyState(), deps, schedule);
		expect(failed.failed).toEqual(["recover_consultations"]);
		expect(failed.ran).toEqual([]);
		const retried = await tick(recordedAt, failed.state, deps, schedule);
		expect(retried.ran).toEqual(["recover_consultations"]);
		expect(attempts).toBe(2);
	});

	test("the schedule calls the plain job functions", () => {
		expect(SCHEDULE.map((job) => [job.name, job.everyMs, job.run])).toEqual([
			["sync_calendar_observations", THIRTY_MINUTES_MS, JOBS.sync_calendar_observations],
			["recover_consultations", ONE_MINUTE_MS, JOBS.recover_consultations],
			["telegram_notifications", ONE_MINUTE_MS, JOBS.telegram_notifications],
		]);
		expect(schedulerEnabled("test")).toBe(false);
		expect(schedulerEnabled("development")).toBe(true);
		expect(schedulerEnabled("staging")).toBe(true);
		expect(schedulerEnabled("production")).toBe(true);
	});

	test("the control CLI names the same jobs", () => {
		expect(parseControlArgs(["job", "sync_calendar_observations"])).toEqual({
			ok: true,
			kind: "job",
			name: "sync_calendar_observations",
		});
		expect(parseControlArgs(["job", "tick"])).toEqual({ ok: true, kind: "tick" });
		expect(parseControlArgs(["job", "missing"]).ok).toBe(false);
		expect(parseControlArgs(["import", "inms", "--fixture", "feed.xml"])).toEqual({
			ok: true,
			kind: "import",
			fixture: "feed.xml",
		});
	});

	test("a recorded calendar tick imports the fixture and does not fetch live", async () => {
		const original = globalThis.fetch;
		let liveFetches = 0;
		globalThis.fetch = (async () => {
			liveFetches += 1;
			throw new Error("live fetch");
		}) as unknown as typeof fetch;
		let fixtureReads = 0;
		const deps = {
			db: testDb().db,
			env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
			primaryKey: "test-primary-key-for-davar-server-only-0001",
			previousKeys: [] as string[],
			fetcher: async () => {
				fixtureReads += 1;
				return recordedFeed;
			},
		};
		try {
			const first = await tick(recordedAt, emptyState(), deps);
			expect(first.failed).toEqual([]);
			expect(first.ran).toContain("sync_calendar_observations");
			expect(fixtureReads).toBe(1);
			expect(liveFetches).toBe(0);
			const imported = await testDb().db.execute(
				sql`SELECT count(*)::int AS count FROM new_moon_observations`,
			);
			expect((imported[0] as { count: number }).count).toBeGreaterThan(0);

			const sameInstant = await tick(recordedAt, first.state, deps);
			expect(sameInstant.ran).toEqual([]);
			expect(fixtureReads).toBe(1);

			expect(dueNames(recordedAt + THIRTY_MINUTES_MS, sameInstant.state)).toContain(
				"sync_calendar_observations",
			);
			const later = await tick(recordedAt + THIRTY_MINUTES_MS, sameInstant.state, deps);
			expect(liveFetches).toBe(0);
			expect(syncCalendarObservations).toBe(JOBS.sync_calendar_observations);
			expect(later.failed).toEqual([]);
		} finally {
			globalThis.fetch = original;
		}
	});

	test("a skipped ifDue tick does not push the next live sync out by another interval", async () => {
		const original = globalThis.fetch;
		let liveFetches = 0;
		globalThis.fetch = (async () => {
			liveFetches += 1;
			throw new Error("live fetch");
		}) as unknown as typeof fetch;
		let fixtureReads = 0;
		const deps = {
			db: testDb().db,
			env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
			primaryKey: "test-primary-key-for-davar-server-only-0001",
			previousKeys: [] as string[],
			fetcher: async () => {
				fixtureReads += 1;
				return recordedFeed;
			},
		};
		try {
			await testDb().db.execute(sql`
				INSERT INTO calendar_feed_states (source, last_attempt_at)
				VALUES ('israeli_new_moon_society', ${new Date(recordedAt).toISOString()}::timestamptz)
			`);
			const early = await tick(recordedAt + 29 * ONE_MINUTE_MS, emptyState(), deps);
			expect(fixtureReads).toBe(0);
			expect(early.state.lastRun.sync_calendar_observations).toBeUndefined();
			expect(early.ran).not.toContain("sync_calendar_observations");

			const due = await tick(recordedAt + THIRTY_MINUTES_MS, early.state, deps);
			expect(fixtureReads).toBe(1);
			expect(due.ran).toContain("sync_calendar_observations");
			expect(due.state.lastRun.sync_calendar_observations).toBe(recordedAt + THIRTY_MINUTES_MS);

			const stillWaiting = await tick(
				recordedAt + THIRTY_MINUTES_MS + THIRTY_MINUTES_MS - 1,
				due.state,
				deps,
			);
			expect(fixtureReads).toBe(1);
			expect(stillWaiting.ran).not.toContain("sync_calendar_observations");
			expect(liveFetches).toBe(0);
		} finally {
			globalThis.fetch = original;
		}
	});
});
