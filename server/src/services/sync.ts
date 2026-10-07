import { and, eq, sql } from "drizzle-orm";
import { join } from "node:path";
import type { DatabaseOrTx } from "../db/client.js";
import { calendarFeedStates, calendarSourceEntries } from "../db/schema.js";
import { DomainError } from "../lib/errors.js";
import { runBridge } from "./bridge.js";
import { backfillForEntries, reportReviews } from "./calendarConfig.js";
import { repoRoot } from "./context.js";
import { FEED_SOURCE, feedState } from "./feedState.js";
import { observationImport, type ObservationRow } from "./imports.js";
import { observationWindowOpen } from "./window.js";

export const FEED_URL =
	"https://moonsocil.blogspot.com/feeds/posts/default?alt=rss&max-results=50";
export const MAX_FEED_BYTES = 8 * 1024 * 1024;
export const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function feedBridgePath(env: NodeJS.ProcessEnv = process.env): string {
	if (env.BORE_FEED_PATH) return env.BORE_FEED_PATH;
	return join(repoRoot(), "server", "lib", "bore", "feed_bridge.py");
}

export interface FeedEntry {
	source_entry_id: string;
	source_url: string;
	title?: string;
	content_hash: string;
	raw_content?: string;
	parse_status: string;
	reason?: string;
	unchanged?: boolean;
	observations: Array<Record<string, unknown>>;
}

export async function fetchFeed(env: NodeJS.ProcessEnv = process.env): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 20000);
	try {
		const response = await fetch(FEED_URL, {
			headers: { "User-Agent": "DavarCalendar/1.0 (+https://github.com/jhonnyisaacc/davar)" },
			signal: controller.signal,
		});
		if (!response.ok || !response.body) {
			throw new DomainError("calendar_feed_unavailable", 503);
		}
		const chunks: Uint8Array[] = [];
		let size = 0;
		const reader = response.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_FEED_BYTES) {
				throw new DomainError("calendar_feed_too_large", 503);
			}
			chunks.push(value);
		}
		const text = new TextDecoder().decode(
			chunks.reduce((merged, chunk) => {
				const next = new Uint8Array(merged.length + chunk.length);
				next.set(merged, 0);
				next.set(chunk, merged.length);
				return next;
			}, new Uint8Array(0)),
		);
		if (Buffer.byteLength(text, "utf8") > MAX_FEED_BYTES) {
			throw new DomainError("calendar_feed_too_large", 503);
		}
		return text;
	} catch (error) {
		if (error instanceof DomainError) throw error;
		throw new DomainError("calendar_feed_unavailable", 503);
	} finally {
		clearTimeout(timeout);
	}
}

export async function parseFeed(
	xml: string,
	known: Record<string, string>,
	now: Date,
	env: NodeJS.ProcessEnv = process.env,
): Promise<FeedEntry[]> {
	if (Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) {
		throw new DomainError("calendar_feed_too_large", 503);
	}
	try {
		const result = await runBridge<{ entries: FeedEntry[] }>(
			feedBridgePath(env),
			{
				rss_xml: xml,
				fetched_at: now.toISOString(),
				known_hashes: known,
				report_reviews: reportReviews(),
			},
			{ pythonBin: env.PYTHON_BIN ?? "python3", failureCode: "calendar_feed_malformed" },
		);
		if (!Array.isArray(result.entries)) throw new DomainError("calendar_feed_malformed", 503);
		return result.entries;
	} catch (error) {
		if (error instanceof DomainError) throw error;
		throw new DomainError("calendar_feed_malformed", 503);
	}
}

export interface SyncReport {
	status: string;
	observations?: number;
	confirmations?: number;
	fetched?: number;
	changed?: number;
	review_count?: number;
	error?: string;
}

export async function syncObservations(
	db: DatabaseOrTx,
	input: {
		rssXml?: string | null;
		now?: Date;
		fetcher?: () => Promise<string>;
		ifDue?: boolean;
		env?: NodeJS.ProcessEnv;
	} = {},
): Promise<SyncReport> {
	const env = input.env ?? process.env;
	const now = input.now ?? new Date();
	const state = await feedState(db);
	if (input.ifDue && !(await syncDue(db, state, now, env))) {
		return { status: state.status };
	}
	return db.transaction(async (tx) => {
		const locked = await tx.execute(
			sql`SELECT * FROM calendar_feed_states WHERE id = ${state.id} FOR UPDATE`,
		);
		const current = locked[0] as
			| { status: string; last_attempt_at: Date | string | null; details: Record<string, unknown> }
			| undefined;
		if (!current) throw new DomainError("not_found", 404);
		if (
			input.ifDue &&
			!dueAt(
				current.last_attempt_at ? new Date(current.last_attempt_at) : null,
				now,
				await observationWindowOpen(tx, now, { env }),
			)
		) {
			return { status: current.status };
		}
		try {
			const xml = input.rssXml ?? (await (input.fetcher ?? (() => fetchFeed(env)))());
			const knownRows = await tx
				.select({
					sourceEntryId: calendarSourceEntries.sourceEntryId,
					contentHash: calendarSourceEntries.contentHash,
				})
				.from(calendarSourceEntries)
				.where(
					and(
						eq(calendarSourceEntries.source, FEED_SOURCE),
						sql`parse_status != 'requires_review'`,
					),
				);
			const known: Record<string, string> = {};
			for (const row of knownRows) known[row.sourceEntryId] = row.contentHash;
			const entries = await parseFeed(xml, known, now, env);
			const changed = entries.filter((entry) => !entry.unchanged);
			const accepted = changed.filter((entry) => entry.parse_status === "ok");
			const backfill = backfillForEntries(entries);
			const report = await observationImport(
				tx,
				{
					schema_version: 1,
					observations: [
						...accepted.flatMap((entry) => entry.observations),
						...backfill,
					] as unknown as ObservationRow[],
					replace_entry_ids: accepted.map((entry) => entry.source_entry_id),
				},
				false,
			);
			for (const entry of entries) {
				const found = await tx
					.select({ id: calendarSourceEntries.id })
					.from(calendarSourceEntries)
					.where(
						and(
							eq(calendarSourceEntries.source, FEED_SOURCE),
							eq(calendarSourceEntries.sourceEntryId, entry.source_entry_id),
						),
					)
					.limit(1);
				if (entry.unchanged) {
					if (found[0]) {
						await tx
							.update(calendarSourceEntries)
							.set({ lastSeenAt: now, updatedAt: new Date() })
							.where(eq(calendarSourceEntries.id, found[0].id));
					}
					continue;
				}
				const values = {
					sourceUrl: entry.source_url,
					title: entry.title ?? null,
					contentHash: entry.content_hash,
					rawContent: entry.raw_content ?? null,
					parseStatus: entry.parse_status,
					reason: entry.reason ?? null,
					lastSeenAt: now,
					lastParsedAt: now,
					updatedAt: new Date(),
				};
				if (found[0]) {
					await tx
						.update(calendarSourceEntries)
						.set(values)
						.where(eq(calendarSourceEntries.id, found[0].id));
				} else {
					await tx.insert(calendarSourceEntries).values({
						source: FEED_SOURCE,
						sourceEntryId: entry.source_entry_id,
						...values,
					});
				}
			}
			const reviews = await tx.execute(sql`
				SELECT count(*)::int AS "count" FROM calendar_source_entries
				WHERE source = ${FEED_SOURCE} AND parse_status = 'requires_review'
			`);
			const reviewCount = (reviews[0] as { count: number }).count;
			const details = {
				...report,
				fetched: entries.length,
				changed: changed.length,
				review_count: reviewCount,
			};
			const status = reviewCount > 0 ? "requires_review" : "ok";
			await tx
				.update(calendarFeedStates)
				.set({
					status,
					lastAttemptAt: now,
					lastSuccessAt: now,
					details,
					updatedAt: new Date(),
				})
				.where(eq(calendarFeedStates.id, state.id));
			return { status, ...details };
		} catch (error) {
			const code = error instanceof DomainError ? error.code : "source_unavailable";
			await tx
				.update(calendarFeedStates)
				.set({
					status: "source_unavailable",
					lastAttemptAt: now,
					details: { ...(current.details ?? {}), error: code },
					updatedAt: new Date(),
				})
				.where(eq(calendarFeedStates.id, state.id));
			return { status: "source_unavailable", error: code };
		}
	});
}

async function syncDue(
	db: DatabaseOrTx,
	state: { lastAttemptAt: Date | null },
	now: Date,
	env: NodeJS.ProcessEnv,
): Promise<boolean> {
	return dueAt(state.lastAttemptAt, now, await observationWindowOpen(db, now, { env }));
}

function dueAt(lastAttempt: Date | null, now: Date, windowOpen: boolean): boolean {
	return (
		(!lastAttempt || lastAttempt.getTime() <= now.getTime() - REFRESH_INTERVAL_MS) &&
		windowOpen
	);
}
