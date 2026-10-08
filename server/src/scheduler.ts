import { JOBS, type JobDeps, type JobName } from "./jobs/functions.js";

export const THIRTY_MINUTES_MS = 30 * 60 * 1000;
export const ONE_MINUTE_MS = 60 * 1000;
export const TICK_MS = ONE_MINUTE_MS;

export interface ScheduledJob {
	name: JobName;
	everyMs: number;
	run: (deps: JobDeps) => Promise<unknown>;
}

export const SCHEDULE: readonly ScheduledJob[] = [
	{
		name: "sync_calendar_observations",
		everyMs: THIRTY_MINUTES_MS,
		run: JOBS.sync_calendar_observations,
	},
	{
		name: "recover_consultations",
		everyMs: ONE_MINUTE_MS,
		run: JOBS.recover_consultations,
	},
	{
		name: "telegram_notifications",
		everyMs: ONE_MINUTE_MS,
		run: JOBS.telegram_notifications,
	},
];

export interface TickState {
	lastRun: Record<string, number>;
}

export interface TickResult {
	ran: string[];
	failed: string[];
	state: TickState;
}

export function emptyState(): TickState {
	return { lastRun: {} };
}

export function dueNames(
	nowMs: number,
	state: TickState,
	schedule: readonly ScheduledJob[] = SCHEDULE,
): string[] {
	const names: string[] = [];
	for (const job of schedule) {
		const last = state.lastRun[job.name];
		if (last === undefined || nowMs - last >= job.everyMs) names.push(job.name);
	}
	return names;
}

export async function tick(
	nowMs: number,
	state: TickState,
	deps: Omit<JobDeps, "now">,
	schedule: readonly ScheduledJob[] = SCHEDULE,
): Promise<TickResult> {
	const next: TickState = { lastRun: { ...state.lastRun } };
	const ran: string[] = [];
	const failed: string[] = [];
	const jobDeps: JobDeps = { ...deps, now: new Date(nowMs) };
	for (const job of schedule) {
		const last = state.lastRun[job.name];
		if (last !== undefined && nowMs - last < job.everyMs) continue;
		try {
			await job.run(jobDeps);
			next.lastRun[job.name] = nowMs;
			ran.push(job.name);
		} catch {
			failed.push(job.name);
		}
	}
	return { ran, failed, state: next };
}

export function schedulerEnabled(env: string | undefined): boolean {
	return env !== "test";
}

export interface SchedulerHandle {
	stop: () => void;
}

export function startScheduler(
	deps: Omit<JobDeps, "now">,
	options: {
		now?: () => number;
		intervalMs?: number;
		schedule?: readonly ScheduledJob[];
	} = {},
): SchedulerHandle {
	let state = emptyState();
	let running = false;
	const schedule = options.schedule ?? SCHEDULE;
	const now = options.now ?? Date.now;

	async function runOnce(): Promise<void> {
		if (running) return;
		running = true;
		try {
			const result = await tick(now(), state, deps, schedule);
			state = result.state;
			if (result.ran.length > 0 || result.failed.length > 0) {
				console.log(
					JSON.stringify({ scheduler: "tick", ran: result.ran, failed: result.failed }),
				);
			}
		} catch {
			console.log(JSON.stringify({ scheduler: "tick", ran: [], failed: ["scheduler"] }));
		} finally {
			running = false;
		}
	}

	void runOnce();
	const timer = setInterval(() => {
		void runOnce();
	}, options.intervalMs ?? TICK_MS);
	timer.unref();
	return {
		stop() {
			clearInterval(timer);
		},
	};
}
