import { sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { DomainError } from "../lib/errors.js";
import { repoRoot } from "./context.js";
import { join } from "node:path";

export interface CalendarDay {
	civil_date: string;
	biblical: { day: number | null; month_id: string | null; month_ordinal: number | null };
	rabbinic: { day: number; month_id: string; year: number };
	events: string[];
	month_status: string;
	year_start_status: string;
	confirmation_id: string | null;
}

export interface CalendarResult {
	schema_version: 1;
	days: CalendarDay[];
	year_start_status: string;
	[key: string]: unknown;
}

export function bridgePath(env: NodeJS.ProcessEnv = process.env): string {
	if (env.BORE_BRIDGE_PATH) return env.BORE_BRIDGE_PATH;
	return join(repoRoot(), "server", "lib", "bore", "bridge.py");
}

function supportedTimeZones(): Set<string> {
	try {
		return new Set((Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf("timeZone"));
	} catch {
		return new Set(["UTC", "Asia/Jerusalem", "America/Argentina/Buenos_Aires"]);
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

export async function biblicalCalendar(
	db: DatabaseOrTx,
	input: {
		instant: unknown;
		latitude: unknown;
		longitude: unknown;
		timezone: unknown;
		count?: unknown;
	},
	deps: { env?: NodeJS.ProcessEnv; pythonBin?: string; bridge?: string } = {},
): Promise<CalendarResult> {
	const env = deps.env ?? process.env;
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
	if (typeof input.timezone !== "string" || !supportedTimeZones().has(input.timezone)) {
		throw new DomainError("invalid_timezone");
	}
	const time = parseInstant(input.instant);
	const rows = await db.execute(sql`
		SELECT mc.id, mc.starts_on_evening AS "startsOnEvening",
			o.id AS "observationId", o.observed_on AS "observedOn",
			o.source, o.source_id AS "sourceId", o.source_url AS "sourceUrl",
			o.provenance, o.created_at AS "createdAt"
		FROM month_confirmations mc
		JOIN new_moon_observations o ON o.id = mc.new_moon_observation_id
		ORDER BY mc.starts_on_evening
	`);
	const confirmations = (rows as unknown as Array<{
		id: string;
		startsOnEvening: string | Date;
		observationId: string;
		observedOn: string | Date;
		source: string;
		sourceId: string;
		sourceUrl: string;
		provenance: Record<string, unknown>;
		createdAt: string | Date;
	}>).map((row) => {
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
		};
	});
	const payload = {
		instant: time.toISOString(),
		latitude: lat,
		longitude: lon,
		timezone: input.timezone,
		count,
		confirmations,
	};
	const bridge = deps.bridge ?? bridgePath(env);
	const python = deps.pythonBin ?? env.PYTHON_BIN ?? "python3";
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn([python, bridge], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch {
		throw new DomainError("calendar_domain_unavailable", 503);
	}
	try {
		const stdin = proc.stdin;
		const stdout = proc.stdout;
		if (typeof stdin === "number" || !stdin || typeof stdout === "number" || !stdout) {
			throw new DomainError("calendar_domain_unavailable", 503);
		}
		stdin.write(JSON.stringify(payload));
		stdin.end();
		const [output, exitCode] = await Promise.all([
			new Response(stdout).text(),
			proc.exited,
		]);
		if (exitCode !== 0) throw new DomainError("calendar_domain_unavailable", 503);
		try {
			return JSON.parse(output) as CalendarResult;
		} catch {
			throw new DomainError("calendar_domain_unavailable", 503);
		}
	} catch (error) {
		if (error instanceof DomainError) throw error;
		throw new DomainError("calendar_domain_unavailable", 503);
	}
}
