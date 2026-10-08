import type { DatabaseOrTx } from "../db/client.js";
import { deliverTelegramNotifications, type NotifyResult } from "../services/notify.js";
import { recoverConsultations } from "../services/recover.js";
import { fetchFeed, syncObservations, type SyncReport } from "../services/sync.js";

export interface JobDeps {
	db: DatabaseOrTx;
	env: NodeJS.ProcessEnv;
	now: Date;
	primaryKey: string;
	previousKeys: string[];
	fetcher?: () => Promise<string>;
}

export async function syncCalendarObservations(deps: JobDeps): Promise<SyncReport> {
	return syncObservations(deps.db, {
		env: deps.env,
		now: deps.now,
		ifDue: true,
		fetcher: deps.fetcher ?? (() => fetchFeed(deps.env)),
	});
}

export async function recoverConsultationsJob(deps: JobDeps): Promise<{ recovered: number }> {
	return recoverConsultations(deps.db, deps.primaryKey);
}

export async function deliverNotifications(deps: JobDeps): Promise<NotifyResult> {
	return deliverTelegramNotifications(deps.db, {
		env: deps.env,
		primaryKey: deps.primaryKey,
		previousKeys: deps.previousKeys,
	});
}

export const JOBS = {
	sync_calendar_observations: syncCalendarObservations,
	recover_consultations: recoverConsultationsJob,
	telegram_notifications: deliverNotifications,
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(value: string): value is JobName {
	return Object.prototype.hasOwnProperty.call(JOBS, value);
}
