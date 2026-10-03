import type { CalendarCity } from "./calendarClient";
import type { CalendarResponse } from "./productContracts";

type Resource<T> = {
	data: T;
	busy: boolean;
	error: boolean;
	searched: boolean;
};
type Workspace = {
	cities: Resource<CalendarCity[]>;
	day: Resource<CalendarResponse | null>;
	annual: Resource<CalendarResponse | null>;
};
type CalendarLookup = {
	searchCities(query: string): Promise<CalendarCity[]>;
	day(offset: number): Promise<CalendarResponse>;
	year(year: number): Promise<CalendarResponse>;
};
const empty = <T>(data: T): Resource<T> => ({
	data,
	busy: false,
	error: false,
	searched: false,
});

// Screen-local requests; location persistence and sunset refresh belong to calendarClient.
export function createCalendarWorkspace(
	client: CalendarLookup,
	schedule = (task: () => void, delay: number) => {
		const timer = setTimeout(task, delay);
		return () => clearTimeout(timer);
	},
) {
	let state: Workspace = {
		cities: empty([]),
		day: empty(null),
		annual: empty(null),
	};
	const listeners = new Set<() => void>();
	function update<K extends keyof Workspace>(key: K, value: Workspace[K]) {
		state = { ...state, [key]: value };
		for (const listener of listeners) listener();
	}
	function request<K extends keyof Workspace>(
		key: K,
		data: Workspace[K]["data"],
		lookup: () => Promise<Workspace[K]["data"]>,
		delay = 0,
	) {
		let active = true;
		update(key, {
			data,
			busy: true,
			error: false,
			searched: false,
		} as Workspace[K]);
		const execute = () => {
			void lookup().then(
				(result) => {
					if (active)
						update(key, {
							data: result,
							busy: false,
							error: false,
							searched: true,
						} as Workspace[K]);
				},
				() => {
					if (active)
						update(key, {
							data,
							busy: false,
							error: true,
							searched: false,
						} as Workspace[K]);
				},
			);
		};
		let cancelTimer: (() => void) | undefined;
		if (delay) cancelTimer = schedule(execute, delay);
		else execute();
		return () => {
			active = false;
			cancelTimer?.();
		};
	}
	return {
		getSnapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		searchCities: (query: string, enabled: boolean) => {
			if (!enabled || query.trim().length < 2) {
				update("cities", empty([]));
				return undefined;
			}
			return request("cities", [], () => client.searchCities(query), 600);
		},
		loadDay: (offset: number, enabled: boolean) => {
			if (!enabled || offset === 0) {
				update("day", empty(null));
				return undefined;
			}
			return request("day", null, () => client.day(offset));
		},
		loadYear: (year: number, enabled: boolean) =>
			enabled ? request("annual", null, () => client.year(year)) : undefined,
	};
}
