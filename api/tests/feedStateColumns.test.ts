import { expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { calendarFeedStates } from "../src/db/schema.js";

test("calendar feed state selects without sync_attempts", () => {
	expect(Object.keys(getTableColumns(calendarFeedStates)).sort()).toEqual([
		"createdAt",
		"details",
		"developmentScenario",
		"id",
		"lastAttemptAt",
		"lastSuccessAt",
		"source",
		"status",
		"updatedAt",
	]);
});
