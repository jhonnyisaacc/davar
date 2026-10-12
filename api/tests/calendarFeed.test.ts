import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { join } from "node:path";
import { testDb } from "./helper.js";
import { makeTestContext, seedFeedState, truncateAll } from "./helper.js";
import { backfillForEntries, monthAnchors, reportReviews } from "../src/services/calendarConfig.js";
import { consumerStatus, feedState } from "../src/services/feedState.js";
import { observationWindowOpen } from "../src/services/window.js";
import { syncObservations } from "../src/services/sync.js";
import { observationImport } from "../src/services/imports.js";

beforeEach(truncateAll);

function observationTable(date: string, observer: string, location: string, time: string): string {
	return `<table><tr><td>Observer</td><td>Location</td><td>Unaided</td></tr><tr><td colspan='3'>${date}</td></tr><tr><td>${observer}</td><td>${location}</td><td>${time}</td></tr></table>`;
}

function rssItem(guid: string, url: string, title: string, html: string): string {
	return `<item><guid>${guid}</guid><link>${url}</link><title>${title}</title><description><![CDATA[${html}]]></description><pubDate>Sat, 12 Sep 2026 18:00:00 +0300</pubDate></item>`;
}

function rss(items: string): string {
	return `<?xml version="1.0"?><rss version="2.0"><channel><title>INMS</title>${items}</channel></rss>`;
}

describe("calendar feed", () => {
	test("pinned configs parse", () => {
		expect(monthAnchors()).toHaveLength(3);
		expect(monthAnchors()[0]).toMatchObject({ starts_on_evening: "2026-01-20", month_ordinal: 11 });
		expect(reportReviews()).toHaveLength(2);
		expect(backfillForEntries([{ source_url: "https://example.test/other" }])).toEqual([]);
		const backfill = backfillForEntries([
			{ source_url: "https://moonsocil.blogspot.com/2026/03/new-moon-nissan-5786.html" },
		]);
		expect(backfill.length).toBeGreaterThan(0);
	});

	test("feed state is a singleton with consumer status", async () => {
		const db = testDb().db;
		const first = await feedState(db);
		const second = await feedState(db);
		expect(first.id).toBe(second.id);
		const status = await consumerStatus(db, new Date(), false);
		expect(status).toMatchObject({
			name: "israeli_new_moon_society",
			url: "https://moonsocil.blogspot.com/",
			status: "pending",
			stale: true,
			review_count: 0,
			development_fixture: false,
		});
	});

	test("sync imports observations, tracks entries and stays idempotent", async () => {
		const db = testDb().db;
		const feed = rss(
			rssItem(
				"test-entry-1",
				"https://moonsocil.blogspot.com/2026/09/test.html",
				"Test report",
				observationTable("12/09/2026", "Test Observer", "Jerusalem", "18:14"),
			),
		);
		const first = await syncObservations(db, { rssXml: feed });
		expect(first.status).toBe("ok");
		expect(first.observations).toBe(1);
		expect(first.confirmations).toBe(1);
		expect(first.fetched).toBe(1);
		expect(first.review_count).toBe(0);

		const observations = await db.execute(
			sql`SELECT source_id AS "sourceId", verified, provenance ->> 'observer' AS observer FROM new_moon_observations`,
		);
		expect(observations).toHaveLength(1);
		expect(observations[0]).toMatchObject({ verified: true, observer: "Test Observer" });

		const second = await syncObservations(db, { rssXml: feed });
		expect(second.observations).toBe(0);
		expect(second.confirmations).toBe(1);
		const same = await db.execute(sql`SELECT count(*)::int AS count FROM new_moon_observations`);
		expect((same[0] as { count: number }).count).toBe(1);
	});

	test("feed fetching never holds the state row lock", async () => {
		const db = testDb().db;
		const feed = rss(
			rssItem(
				"lock-post",
				"https://example.test/lock-post",
				"Lock post",
				observationTable("12/09/2026", "Lock Observer", "Jerusalem", "18:14"),
			),
		);
		let fetchStarted = false;
		const pending = syncObservations(db, {
			fetcher: async () => {
				fetchStarted = true;
				await new Promise((resolve) => setTimeout(resolve, 400));
				return feed;
			},
		});
		while (!fetchStarted) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		// The fetch is in flight: the state row must be lock-free.
		const state = await feedState(db);
		const probe = await testDb().sql`
			SELECT id FROM calendar_feed_states WHERE id = ${state.id} FOR UPDATE NOWAIT
		`;
		expect(probe.length).toBe(1);
		const report = await pending;
		expect(report.status).toBe("ok");
	});

	test("calendar payload requires an explicit file", async () => {
		const { calendarPayload } = await import("../src/services/sync.js");
		expect(calendarPayload({})).toEqual({ kind: "skip", reason: "IMPORT_FILE is required" });
		expect(calendarPayload({ IMPORT_FILE: "feed.xml" })).toEqual({
			kind: "file",
			path: "feed.xml",
		});
	});

	test("jobs:calendar is a no-op without IMPORT_FILE", async () => {
		const env = { ...process.env };
		delete env.IMPORT_FILE;
		const proc = Bun.spawn([process.execPath, "src/jobs/calendar.ts"], {
			cwd: join(import.meta.dir, ".."),
			env,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, code] = await Promise.all([
			new Response(proc.stdout).text(),
			proc.exited,
		]);
		expect(code).toBe(0);
		expect(JSON.parse(out)).toMatchObject({
			job: "sync_calendar_observations",
			status: "skipped",
		});
	});

	test("sync marks the feed unavailable when fetching fails", async () => {
		const db = testDb().db;
		const { DomainError } = await import("../src/lib/errors.js");
		const report = await syncObservations(db, {
			fetcher: async () => {
				throw new DomainError("calendar_feed_unavailable", 503);
			},
		});
		expect(report).toMatchObject({ status: "source_unavailable", error: "calendar_feed_unavailable" });
		const status = await consumerStatus(db, new Date(), false);
		expect(status.status).toBe("source_unavailable");
		expect(status.stale).toBe(true);
	});

	test("backfill supplements the matching historical report", async () => {
		const db = testDb().db;
		const feed = rss(
			rssItem(
				"history-post",
				"https://moonsocil.blogspot.com/2026/03/new-moon-nissan-5786.html",
				"Forecast post",
				"<p>No witness table yet.</p>",
			),
		);
		const report = await syncObservations(db, { rssXml: feed });
		expect(report.status).toBe("ok");
		const backfilled = await db.execute(
			sql`SELECT count(*)::int AS count FROM new_moon_observations WHERE provenance ->> 'source_entry_id' LIKE 'inms-history:%'`,
		);
		expect((backfilled[0] as { count: number }).count).toBeGreaterThan(0);
	});

	test("observation window bootstraps empty calendars and gates polling", async () => {
		const db = testDb().db;
		expect(await observationWindowOpen(db, new Date("2026-10-07T00:00:00Z"))).toBe(true);
		await observationImport(
			db,
			{
				schema_version: 1,
				observations: [
					{
						id: "inms:old",
						source: "israeli_new_moon_society",
						source_url: "https://moonsocil.blogspot.com/old",
						observed_on: "2026-08-01",
						country: "IL",
						visibility_method: "unaided",
						verified: true,
						raw_source_hash: "old-hash",
					},
				],
			},
			false,
		);
		// 29+ days after the August start: the window is open.
		expect(await observationWindowOpen(db, new Date("2026-10-07T00:00:00Z"))).toBe(true);
		// Days after a fresh sighting: polling stays closed.
		await observationImport(
			db,
			{
				schema_version: 1,
				observations: [
					{
						id: "inms:fresh",
						source: "israeli_new_moon_society",
						source_url: "https://moonsocil.blogspot.com/fresh",
						observed_on: "2026-10-05",
						country: "IL",
						visibility_method: "unaided",
						verified: true,
						raw_source_hash: "fresh-hash",
					},
				],
			},
			false,
		);
		expect(await observationWindowOpen(db, new Date("2026-10-07T00:00:00Z"))).toBe(false);
	});

	test("live calendar attaches witness evidence and consumer status", async () => {
		const db = testDb().db;
		const feed = rss(
			rssItem(
				"test-entry-1",
				"https://moonsocil.blogspot.com/2026/09/test.html",
				"Test report",
				observationTable("12/09/2026", "Test Observer", "Jerusalem", "18:14"),
			),
		);
		await syncObservations(db, { rssXml: feed });
		// Fresh sync: calendar reads must not refetch.
		const { app } = makeTestContext();
		const res = await app.request(
			`/api/v1/calendar/today?${new URLSearchParams({
				instant: "2026-09-13T12:00:00Z",
				latitude: "31.78",
				longitude: "35.23",
				timezone: "Asia/Jerusalem",
			}).toString()}`,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			days: Array<{ observation: Record<string, unknown> | null; biblical: { month_id: unknown } }>;
			generated_at: string;
			source: Record<string, unknown>;
		};
		expect(typeof body.generated_at).toBe("string");
		expect(body.source).toMatchObject({ name: "israeli_new_moon_society", development_fixture: false });
		const confirmed = body.days.filter((day) => day.observation);
		expect(confirmed.length).toBeGreaterThan(0);
		expect(confirmed[0]?.observation).toMatchObject({
			observed_on: "2026-09-12",
			unaided: true,
			development_fixture: false,
		});
	});
});
