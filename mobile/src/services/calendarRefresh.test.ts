// eslint-disable-next-line import/no-unresolved
import { expect, test } from "bun:test";
import {
	calendarIsOutdated,
	calendarRefreshDelay,
} from "../../../shared/calendarRefresh";
import type { CalendarResponse } from "../../../shared/productContracts";

const now = Date.parse("2026-10-03T15:00:00Z");
const calendar: CalendarResponse = {
	schema_version: 1,
	days: [],
	year_start_status: "unresolved",
	generated_at: "2026-10-03T15:00:00Z",
	next_sunset_at: "2026-10-03T15:03:00Z",
};
test("refresh follows the server sunset rather than waiting for the normal interval", () => {
	expect(calendarRefreshDelay(calendar, now)).toBe(181_000);
	expect(calendarIsOutdated(calendar, now)).toBe(false);
	expect(calendarIsOutdated(calendar, now + 180_000)).toBe(true);
});
test("an offline cached day retries at a bounded interval without advancing its date", () => {
	expect(calendarRefreshDelay(calendar, now + 181_000)).toBe(60_000);
	expect(
		calendarIsOutdated(
			{ ...calendar, next_sunset_at: undefined },
			now + 900_000,
		),
	).toBe(true);
});
