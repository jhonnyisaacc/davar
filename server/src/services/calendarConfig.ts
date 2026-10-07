import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./context.js";

function configDir(): string {
	return process.env.DAVAR_CONFIG_DIR ?? join(repoRoot(), "server", "config");
}

// Minimal reader for the two shapes used by the pinned calendar configs:
// a top-level list of maps with scalar string values. Anything else throws.
export function readConfigList(name: string): Array<Record<string, string>> {
	const text = readFileSync(join(configDir(), name), "utf8");
	const items: Array<Record<string, string>> = [];
	let current: Record<string, string> | null = null;
	for (const line of text.split("\n")) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const itemStart = line.match(/^\s*-\s+(.*)$/);
		if (itemStart) {
			current = {};
			items.push(current);
			const rest = (itemStart[1] ?? "").trim();
			if (rest) assignPair(current, rest);
			continue;
		}
		const pair = line.match(/^\s+([A-Za-z_]+):\s?(.*)$/);
		if (pair && current) {
			assignPair(current, `${pair[1]}: ${pair[2] ?? ""}`);
			continue;
		}
		throw new Error(`Unsupported config line in ${name}: ${line}`);
	}
	return items;
}

function assignPair(target: Record<string, string>, fragment: string): void {
	const separator = fragment.indexOf(":");
	if (separator < 0) throw new Error(`Bad config pair: ${fragment}`);
	const key = fragment.slice(0, separator).trim();
	let value = fragment.slice(separator + 1).trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}
	target[key] = value;
}

export interface MonthAnchor {
	starts_on_evening: string;
	month_ordinal: number;
	source_url: string;
	note: string;
}

export function monthAnchors(): MonthAnchor[] {
	return readConfigList("calendar_month_anchors.yml").map((item) => ({
		starts_on_evening: item.starts_on_evening ?? "",
		month_ordinal: Number(item.month_ordinal ?? "0"),
		source_url: item.source_url ?? "",
		note: item.note ?? "",
	}));
}

export interface ReportReview {
	source_url: string;
	content_hash: string;
	observed_on: string;
	note: string;
	corroborating_url: string;
}

export function reportReviews(): ReportReview[] {
	return readConfigList("calendar_report_reviews.yml").map((item) => ({
		source_url: item.source_url ?? "",
		content_hash: item.content_hash ?? "",
		observed_on: item.observed_on ?? "",
		note: item.note ?? "",
		corroborating_url: item.corroborating_url ?? "",
	}));
}

export interface BackfillData {
	schema_version: number;
	report_url: string;
	observations: Array<Record<string, unknown>>;
}

export function backfillData(): BackfillData {
	const text = readFileSync(join(configDir(), "calendar_observation_backfill.json"), "utf8");
	return JSON.parse(text) as BackfillData;
}

export function backfillForEntries(entries: Array<{ source_url: string }>): Array<Record<string, unknown>> {
	const data = backfillData();
	return entries.some((entry) => entry.source_url === data.report_url)
		? data.observations
		: [];
}
