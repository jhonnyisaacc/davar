import type { DatabaseOrTx } from "../db/client.js";
import { observationImport } from "./imports.js";

export interface CalendarSyncResult {
	synced: number;
	confirmations: number;
	status: "applied" | "dry_run" | "not_configured";
}

export async function syncCalendarObservations(
	db: DatabaseOrTx,
	input: {
		payload?: { schema_version: number; observations: Array<Record<string, never>> } | null;
		apply?: boolean;
	} = {},
): Promise<CalendarSyncResult> {
	// No production observation feed is configured in this PR; the sync only
	// runs against an explicitly provided reviewed payload (same shape as the
	// import_observations operator command). Anything else is a no-op so a
	// scheduler can never invent provenance.
	if (!input.payload) {
		return { synced: 0, confirmations: 0, status: "not_configured" };
	}
	const report = await observationImport(
		db,
		input.payload as unknown as Parameters<typeof observationImport>[1],
		!input.apply,
	);
	return {
		synced: report.observations,
		confirmations: report.confirmations,
		status: input.apply ? "applied" : "dry_run",
	};
}
