import { eq } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { calendarFeedStates } from "../db/schema.js";
import { isUniqueViolation } from "./accounts.js";

export const FEED_SOURCE = "israeli_new_moon_society";
export const FEED_URL = "https://moonsocil.blogspot.com/";

export interface FeedState {
	id: string;
	source: string;
	status: string;
	developmentScenario: string;
	lastAttemptAt: Date | null;
	lastSuccessAt: Date | null;
	syncAttempts: number;
	details: Record<string, unknown>;
}

export async function feedState(db: DatabaseOrTx): Promise<FeedState> {
	const existing = await db
		.select()
		.from(calendarFeedStates)
		.where(eq(calendarFeedStates.source, FEED_SOURCE))
		.limit(1);
	if (existing[0]) return rowOf(existing[0]);
	try {
		const created = await db
			.insert(calendarFeedStates)
			.values({ source: FEED_SOURCE })
			.returning();
		const row = created[0];
		if (!row) throw new Error("Feed state insert failed");
		return rowOf(row);
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		const retry = await db
			.select()
			.from(calendarFeedStates)
			.where(eq(calendarFeedStates.source, FEED_SOURCE))
			.limit(1);
		const row = retry[0];
		if (!row) throw new Error("Feed state resolution failed");
		return rowOf(row);
	}
}

function rowOf(row: {
	id: string;
	source: string;
	status: string;
	developmentScenario: string;
	lastAttemptAt: Date | null;
	lastSuccessAt: Date | null;
	syncAttempts: number;
	details: Record<string, unknown>;
}): FeedState {
	return {
		id: row.id,
		source: row.source,
		status: row.status,
		developmentScenario: row.developmentScenario,
		lastAttemptAt: row.lastAttemptAt,
		lastSuccessAt: row.lastSuccessAt,
		syncAttempts: row.syncAttempts,
		details: row.details ?? {},
	};
}

export async function consumerStatus(
	db: DatabaseOrTx,
	now: Date = new Date(),
	windowOpen: boolean | null = null,
): Promise<{
	name: string;
	url: string;
	status: string;
	last_checked_at: string | null;
	last_synced_at: string | null;
	stale: boolean;
	review_count: number;
	development_fixture: boolean;
}> {
	const state = await feedState(db);
	const open = windowOpen ?? true;
	return {
		name: FEED_SOURCE,
		url: FEED_URL,
		status: state.status,
		last_checked_at: state.lastAttemptAt?.toISOString() ?? null,
		last_synced_at: state.lastSuccessAt?.toISOString() ?? null,
		stale:
			!state.lastSuccessAt ||
			state.status === "source_unavailable" ||
			(state.lastSuccessAt.getTime() < now.getTime() - 2 * 60 * 60 * 1000 && open),
		review_count: Number(state.details.review_count ?? 0),
		development_fixture: false,
	};
}
