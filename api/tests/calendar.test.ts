import { beforeEach, describe, expect, test } from "bun:test";
import { testDb } from "./helper.js";
import { makeTestContext, seedFeedState, truncateAll } from "./helper.js";
import { articles } from "../src/db/schema.js";
import { enc } from "../src/services/fields.js";
import { eq } from "drizzle-orm";

beforeEach(truncateAll);

const TODAY = {
	instant: "2026-09-30T12:00:00Z",
	latitude: "31.78",
	longitude: "35.23",
	timezone: "Asia/Jerusalem",
};

function query(params: Record<string, string>): string {
	return `/api/v1/calendar/today?${new URLSearchParams(params).toString()}`;
}

describe("calendar", () => {
	test("today is public and matches the pinned Bore shape", async () => {
		await seedFeedState();
		const { app } = makeTestContext();
		const res = await app.request(query(TODAY));
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		const body = (await res.json()) as {
			schema_version: number;
			days: Array<{
				civil_date: string;
				biblical: { day: unknown; month_id: unknown; month_ordinal: unknown };
				rabbinic: { day: number; month_id: string; year: number };
				events: string[];
				month_status: string;
				year_start_status: string;
				confirmation_id: unknown;
			}>;
			year_start_status: string;
		};
		expect(body.schema_version).toBe(1);
		expect(body.days).toHaveLength(1);
		expect(body.days[0]?.civil_date).toBe("2026-09-30");
		expect(body.days[0]?.month_status).toBe("pending");
		expect(body.year_start_status).toBe("unresolved");
		expect(body.days[0]?.rabbinic).toEqual({ day: 19, month_id: "tishrei", year: 5787 });
	});

	test("sunset advances the civil lookup", async () => {
		await seedFeedState();
		const { app } = makeTestContext();
		const evening = await app.request(
			query({ ...TODAY, instant: "2026-09-30T22:00:00Z" }),
		);
		expect(evening.status).toBe(200);
		const body = (await evening.json()) as { days: Array<{ civil_date: string }> };
		expect(body.days[0]?.civil_date).toBe("2026-10-01");
	});

	test("upcoming honors the day count", async () => {
		await seedFeedState();
		const { app } = makeTestContext();
		const res = await app.request(
			`/api/v1/calendar/upcoming?${new URLSearchParams({ ...TODAY, days: "3" }).toString()}`,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { days: unknown[] };
		expect(body.days).toHaveLength(3);
	});

	test("accepts a legacy timezone link the browser still sends", async () => {
		await seedFeedState();
		const { app } = makeTestContext();
		const res = await app.request(query({ ...TODAY, timezone: "America/Buenos_Aires" }));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { days: Array<{ civil_date: string }> };
		expect(body.days).toHaveLength(1);
		expect(body.days[0]?.civil_date).toBe("2026-09-30");
	});

	test("rejects unbounded years, bad zones and bad ranges", async () => {
		const { app } = makeTestContext();
		const ancient = await app.request(query({ ...TODAY, instant: "0001-01-01T12:00:00Z" }));
		expect(ancient.status).toBe(422);
		expect(await ancient.json()).toEqual({ error: { code: "invalid_calendar_range" } });

		const zone = await app.request(query({ ...TODAY, timezone: "Mars/Olympus" }));
		expect(zone.status).toBe(422);
		expect(await zone.json()).toEqual({ error: { code: "invalid_timezone" } });

		const range = await app.request(
			`/api/v1/calendar/upcoming?${new URLSearchParams({ ...TODAY, days: "zzz" }).toString()}`,
		);
		expect(range.status).toBe(422);
		expect(await range.json()).toEqual({ error: { code: "invalid_calendar_range" } });

		const missing = await app.request(
			`/api/v1/calendar/today?${new URLSearchParams({ instant: TODAY.instant, timezone: TODAY.timezone }).toString()}`,
		);
		expect(missing.status).toBe(422);
		expect(await missing.json()).toEqual({ error: { code: "invalid_calendar_location" } });
	});

	test("locations are public and hide the signed selection", async () => {
		const { app, deps } = makeTestContext();
		deps.env = {
			...deps.env,
			DAVAR_DEV_SANDBOX: "1",
			NODE_ENV: "development",
		} as NodeJS.ProcessEnv;
		const res = await app.request("/api/v1/calendar/locations?q=Jeru");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { cities: Array<Record<string, unknown>> };
		expect(body.cities.length).toBeGreaterThan(0);
		expect(body.cities[0]).not.toHaveProperty("selection");
		expect(body.cities[0]).toHaveProperty("city", "Jerusalem");
	});
});

describe("articles", () => {
	test("published articles are public and drafts stay hidden", async () => {
		const { app, deps } = makeTestContext();
		const empty = await app.request("/api/v1/articles");
		expect(empty.status).toBe(200);
		expect(await empty.json()).toEqual({ articles: [], next_offset: null });

		const key = deps.config.encryptionPrimaryKey;
		const published = await testDb()
			.db.insert(articles)
			.values({
				sourceId: "shaul:note:test",
				title: "Title",
				locale: "en",
				body: await enc("Body", key),
				sourceUrl: "https://shaul.vercel.app/test",
				attribution: "Author",
				revision: "rev-1",
				inputHash: "hash",
				publicationState: "published",
				references: [],
				permissions: { public_display: true },
			})
			.returning({ id: articles.id });
		await testDb()
			.db.insert(articles)
			.values({
				sourceId: "shaul:note:draft",
				title: "Draft",
				locale: "en",
				body: await enc("Draft", key),
				sourceUrl: "https://shaul.vercel.app/draft",
				attribution: "Author",
				revision: "rev-1",
				inputHash: "hash",
				publicationState: "draft",
				references: [],
				permissions: {},
			});

		const index = await app.request("/api/v1/articles");
		const list = ((await index.json()) as { articles: Array<Record<string, unknown>> }).articles;
		expect(list).toHaveLength(1);
		expect(Object.keys(list[0] ?? {}).sort()).toEqual(
			["attribution", "id", "locale", "references", "revision", "source_id", "source_url", "title"].sort(),
		);
		expect(list[0]).not.toHaveProperty("body");

		const filtered = await app.request("/api/v1/articles?locale=he");
		expect(((await filtered.json()) as { articles: unknown[] }).articles).toEqual([]);

		const paged = (await (
			await app.request("/api/v1/articles?locale=en&page=2")
		).json()) as { articles: unknown[]; next_offset: number | null };
		expect(paged.articles).toEqual([]);
		expect(paged.next_offset).toBe(null);

		const id = published[0]?.id ?? "";
		const show = await app.request(`/api/v1/articles/${id}`);
		expect(show.status).toBe(200);
		const detail = (await show.json()) as Record<string, unknown>;
		expect(detail.body).toBe("Body");
		expect(detail.permissions).toEqual({ public_display: true });

		const draft = await testDb()
			.db.select({ id: articles.id })
			.from(articles)
			.where(eq(articles.sourceId, "shaul:note:draft"))
			.limit(1);
		const hidden = await app.request(`/api/v1/articles/${draft[0]?.id}`);
		expect(hidden.status).toBe(404);
	});
});
