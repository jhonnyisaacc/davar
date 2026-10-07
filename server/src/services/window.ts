import { sql } from "drizzle-orm";
import { join } from "node:path";
import type { DatabaseOrTx } from "../db/client.js";
import { DomainError } from "../lib/errors.js";
import { runBridge } from "./bridge.js";
import { repoRoot } from "./context.js";

export function windowBridgePath(env: NodeJS.ProcessEnv = process.env): string {
	if (env.BORE_WINDOW_PATH) return env.BORE_WINDOW_PATH;
	return join(repoRoot(), "server", "lib", "bore", "observation_window.py");
}

export async function windowOpensAt(
	startsOnEvening: string,
	options: { env?: NodeJS.ProcessEnv; pythonBin?: string; bridge?: string } = {},
): Promise<Date> {
	const env = options.env ?? process.env;
	const result = await runBridge<{ opens_at: string }>(
		options.bridge ?? windowBridgePath(env),
		{ starts_on_evening: startsOnEvening },
		{
			pythonBin: options.pythonBin ?? env.PYTHON_BIN ?? "python3",
			failureCode: "calendar_domain_unavailable",
		},
	);
	const opensAt = new Date(result.opens_at);
	if (Number.isNaN(opensAt.getTime())) throw new DomainError("calendar_domain_unavailable", 503);
	return opensAt;
}

export function jerusalemDate(now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Jerusalem",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	return parts;
}

export async function observationWindowOpen(
	db: DatabaseOrTx,
	now: Date = new Date(),
	options: { env?: NodeJS.ProcessEnv } = {},
): Promise<boolean> {
	const rows = await db.execute(sql`
		SELECT mc.starts_on_evening AS "startsOn"
		FROM month_confirmations mc
		JOIN new_moon_observations o ON o.id = mc.new_moon_observation_id
		WHERE COALESCE(o.provenance ->> 'development_fixture', 'false') != 'true'
		AND mc.starts_on_evening <= ${jerusalemDate(now)}::date
		ORDER BY mc.starts_on_evening DESC LIMIT 1
	`);
	const start = (rows[0] as { startsOn: string | Date } | undefined)?.startsOn;
	// Bootstrap a calendar without any imported sightings.
	if (!start) return true;
	const iso = start instanceof Date ? start.toISOString().slice(0, 10) : String(start).slice(0, 10);
	return now >= (await windowOpensAt(iso, options));
}
