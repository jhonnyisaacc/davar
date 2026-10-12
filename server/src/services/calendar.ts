import { sql } from "drizzle-orm";
import { join } from "node:path";
import type { DatabaseOrTx } from "../db/client.js";
import { DomainError } from "../lib/errors.js";
import { runBridge } from "./bridge.js";
import { monthAnchors } from "./calendarConfig.js";
import { serverPackageRoot } from "./context.js";
import { consumerStatus, feedState, FEED_SOURCE } from "./feedState.js";
import { sandboxEnabled } from "./sandbox.js";
import { observationWindowOpen } from "./window.js";
import { syncObservations } from "./sync.js";

export interface CalendarDay {
	civil_date: string;
	biblical: { day: number | null; month_id: string | null; month_ordinal: number | null };
	month_identity: unknown;
	rabbinic: { day: number; month_id: string; year: number };
	events: string[];
	counted_events: unknown[];
	month_status: string;
	year_start_status: string;
	confirmation_id: string | null;
	sunset_at?: string;
	observation?: unknown;
}

export interface CalendarResult {
	schema_version: 1;
	days: CalendarDay[];
	year_start_status: string;
	next_sunset_at?: string;
	timezone?: string;
	generated_at?: string;
	source?: unknown;
	[key: string]: unknown;
}

export function bridgePath(env: NodeJS.ProcessEnv = process.env): string {
	if (env.BORE_BRIDGE_PATH) return env.BORE_BRIDGE_PATH;
	return join(serverPackageRoot(env), "lib", "bore", "bridge.py");
}

export const COUNTING_RULE = "weekly_shabbat_during_hag_hamatzot";

function canonicalTimeZone(value: unknown): string | null {
	if (typeof value !== "string" || value.trim() === "") return null;
	try {
		const resolved = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
		return resolved ? resolved : null;
	} catch {
		return null;
	}
}

export function parseInstant(raw: unknown): Date {
	if (typeof raw !== "string") throw new DomainError("invalid_calendar_request");
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) throw new DomainError("invalid_calendar_request");
	if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) {
		throw new DomainError("invalid_calendar_range");
	}
	if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
		throw new DomainError("instant_timezone_required");
	}
	return date;
}

interface ConfirmationRow {
	id: string;
	startsOnEvening: string | Date;
	observationId: string;
	observedOn: string | Date;
	source: string;
	sourceId: string;
	sourceUrl: string;
	provenance: Record<string, unknown>;
	createdAt: string | Date;
}

function confirmationPayload(row: ConfirmationRow) {
	const observedOn = new Date(row.observedOn);
	const startsOn = new Date(row.startsOnEvening);
	return {
		id: row.id,
		status: "confirmed",
		observed_on: observedOn.toISOString().slice(0, 10),
		starts_on_evening: startsOn.toISOString().slice(0, 10),
		source: row.source,
		source_entry_id: row.sourceId,
		source_url: row.sourceUrl,
		observation_ids: [row.observationId],
		observers: row.provenance?.observer ? [row.provenance.observer] : [],
		locations: row.provenance?.location ? [row.provenance.location] : [],
		unaided: true,
		ingested_at: new Date(row.createdAt).toISOString(),
		reason: "Verified INMS unaided Israel observation",
		fixture: row.provenance?.development_fixture === true,
	};
}

export async function biblicalCalendar(
	db: DatabaseOrTx,
	input: {
		instant: unknown;
		latitude: unknown;
		longitude: unknown;
		timezone: unknown;
		count?: unknown;
		refreshSource?: boolean;
	},
	deps: { env?: NodeJS.ProcessEnv; pythonBin?: string; bridge?: string; nodeEnv?: string } = {},
): Promise<CalendarResult> {
	const env = deps.env ?? process.env;
	const nodeEnv = deps.nodeEnv ?? env.NODE_ENV ?? "development";
	const lat = Number(input.latitude);
	const lon = Number(input.longitude);
	const count = input.count === undefined ? 1 : Number(input.count);
	if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
		throw new DomainError("invalid_calendar_location");
	}
	if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
		throw new DomainError("invalid_calendar_location");
	}
	if (!Number.isInteger(count) || count < 1 || count > 60) {
		throw new DomainError("invalid_calendar_range");
	}
	const timezone = canonicalTimeZone(input.timezone);
	if (!timezone) throw new DomainError("invalid_timezone");
	const time = parseInstant(input.instant);
	let state = await feedState(db);
	const scenario = sandboxEnabled(env, nodeEnv) ? state.developmentScenario : "live";
	if (input.refreshSource && scenario === "live") {
		await syncObservations(db, { ifDue: true, env });
		state = await feedState(db);
	}
	let confirmations: Array<ReturnType<typeof confirmationPayload>>;
	if (scenario === "confirmed") {
		const rows = (await db.execute(sql`
			SELECT mc.id, mc.starts_on_evening AS "startsOnEvening",
				o.id AS "observationId", o.observed_on AS "observedOn",
				o.source, o.source_id AS "sourceId", o.source_url AS "sourceUrl",
				o.provenance, o.created_at AS "createdAt"
			FROM month_confirmations mc
			JOIN new_moon_observations o ON o.id = mc.new_moon_observation_id
			WHERE o.provenance ->> 'development_fixture' = 'true'
			ORDER BY mc.starts_on_evening
		`)) as unknown as ConfirmationRow[];
		// Fixture confirmations start on the observed evening itself.
		confirmations = rows.map((row) => {
			const payload = confirmationPayload(row);
			return { ...payload, starts_on_evening: payload.observed_on };
		});
	} else if (scenario === "pending") {
		confirmations = [];
	} else {
		const rows = (await db.execute(sql`
			SELECT mc.id, mc.starts_on_evening AS "startsOnEvening",
				o.id AS "observationId", o.observed_on AS "observedOn",
				o.source, o.source_id AS "sourceId", o.source_url AS "sourceUrl",
				o.provenance, o.created_at AS "createdAt"
			FROM month_confirmations mc
			JOIN new_moon_observations o ON o.id = mc.new_moon_observation_id
			WHERE COALESCE(o.provenance ->> 'development_fixture', 'false') != 'true'
			ORDER BY mc.starts_on_evening
		`)) as unknown as ConfirmationRow[];
		confirmations = rows.map(confirmationPayload);
	}
	const payload = {
		instant: time.toISOString(),
		latitude: lat,
		longitude: lon,
		timezone,
		count,
		month_anchors: scenario === "live" ? monthAnchors() : [],
		counting_rule: scenario === "live" ? COUNTING_RULE : null,
		confirmations,
	};
	const result = await runBridge<CalendarResult>(
		deps.bridge ?? bridgePath(env),
		payload,
		{ pythonBin: deps.pythonBin ?? env.PYTHON_BIN ?? "python3" },
	);
	const witnesses =
		confirmations.length === 0
			? []
			: ((await db.execute(sql`
		SELECT observed_on AS "observedOn", source_url AS "sourceUrl",
			provenance ->> 'observer' AS "observer", provenance ->> 'location' AS "location",
			COALESCE(provenance ->> 'development_fixture', 'false') = 'true' AS "fixture"
		FROM new_moon_observations
		WHERE source = ${FEED_SOURCE} AND country = 'IL'
			AND visibility_method = 'unaided' AND verified = true
			AND observed_on IN (${sql.join(confirmations.map((c) => sql`${c.starts_on_evening}::date`), sql`, `)})
		ORDER BY source_id
	`)) as unknown as Array<{
				observedOn: string | Date;
				sourceUrl: string;
				observer: string | null;
				location: string | null;
				fixture: boolean;
			}>);
	const evidence: Record<string, unknown> = {};
	for (const confirmation of confirmations) {
		const match = witnesses.filter((witness) => {
			const day =
				witness.observedOn instanceof Date
					? witness.observedOn.toISOString().slice(0, 10)
					: String(witness.observedOn).slice(0, 10);
			return day === confirmation.starts_on_evening;
		});
		const synthetic = confirmation.fixture;
		const group = match.filter((witness) => witness.fixture === synthetic);
		evidence[confirmation.id] = {
			observed_on: confirmation.observed_on,
			source_url: confirmation.source_url,
			observers: [...new Set(group.map((witness) => witness.observer).filter(Boolean))],
			locations: [...new Set(group.map((witness) => witness.location).filter(Boolean))],
			unaided: true,
			development_fixture: synthetic,
		};
	}
	for (const day of result.days) {
		day.observation = (evidence[day.confirmation_id ?? ""] ?? null) as unknown;
	}
	result.generated_at = new Date().toISOString();
	if (scenario === "live") {
		result.source = await consumerStatus(
			db,
			new Date(),
			await observationWindowOpen(db, new Date(), { env }),
		);
	} else {
		result.source = {
			name: "development_fixture",
			url: null,
			status: `synthetic_${scenario}`,
			stale: false,
			review_count: 0,
			last_checked_at: null,
			last_synced_at: null,
			development_fixture: true,
		};
	}
	void state;
	return result;
}
