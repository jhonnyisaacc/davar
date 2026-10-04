import { calendarRefreshDelay } from "./calendarRefresh";
import type { ProductClient } from "./productClient";
import type { CalendarResponse } from "./productContracts";

export const CALENDAR_LOCATION_KEY = "davar-calendar-location";
export type CalendarCity = {
	city: string;
	country: string;
	state?: string;
	latitude: number;
	longitude: number;
};
type Storage = {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<unknown>;
};
export type CalendarState = {
	city: CalendarCity | null;
	timezone: string;
	calendar: CalendarResponse | null;
	restored: boolean;
	busy: boolean;
	error: string | null;
};

export function parseCalendarLocation(
	value: string | null,
): { city: CalendarCity; timezone: string } | null {
	try {
		const saved = JSON.parse(value || "null");
		const city = saved?.city;
		if (
			!city ||
			typeof city.city !== "string" ||
			!city.city.trim() ||
			typeof city.country !== "string" ||
			!Number.isFinite(city.latitude) ||
			Math.abs(city.latitude) > 90 ||
			!Number.isFinite(city.longitude) ||
			Math.abs(city.longitude) > 180 ||
			typeof saved.timezone !== "string"
		)
			return null;
		new Intl.DateTimeFormat("en", { timeZone: saved.timezone });
		return { city, timezone: saved.timezone };
	} catch {
		return null;
	}
}

function parseSavedCalendar(
	value: string | null,
	timezone: string,
	now = Date.now(),
): CalendarResponse | null {
	try {
		const calendar = JSON.parse(value || "null")?.calendar;
		const generated = Date.parse(calendar?.generated_at || "");
		const sunset = Date.parse(calendar?.next_sunset_at || "");
		if (
			calendar?.schema_version !== 1 ||
			!Number.isFinite(generated) ||
			generated > now ||
			now - generated > 24 * 60 * 60 * 1000 ||
			!Number.isFinite(sunset) ||
			sunset <= now ||
			(calendar.timezone !== undefined && calendar.timezone !== timezone) ||
			typeof calendar.year_start_status !== "string" ||
			!Array.isArray(calendar.days) ||
			!calendar.days.length ||
			!calendar.days.every(
				(day: CalendarResponse["days"][number]) =>
					day &&
					typeof day.civil_date === "string" &&
					day.biblical &&
					(day.biblical.day === null ||
						(Number.isInteger(day.biblical.day) &&
							day.biblical.day >= 1 &&
							day.biblical.day <= 30)) &&
					day.rabbinic &&
					Number.isInteger(day.rabbinic.day) &&
					typeof day.rabbinic.month_id === "string" &&
					Number.isInteger(day.rabbinic.year) &&
					typeof day.month_status === "string" &&
					typeof day.year_start_status === "string" &&
					Array.isArray(day.events) &&
					day.events.every((event) => typeof event === "string"),
			)
		)
			return null;
		return calendar;
	} catch {
		return null;
	}
}

export function createCalendarClient(
	api: Pick<ProductClient, "request">,
	storage: Storage,
) {
	let state: CalendarState = {
		city: null,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		calendar: null,
		restored: false,
		busy: false,
		error: null,
	};
	const listeners = new Set<() => void>();
	let restore: Promise<void> | null = null;
	let requestId = 0;
	let active = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let writes: Promise<unknown> = Promise.resolve();
	const persist = () => {
		// Store the public calendar with its location, and keep city changes in order.
		const saved = JSON.stringify({
			city: state.city,
			timezone: state.timezone,
			calendar: state.calendar,
		});
		writes = writes
			.then(() => storage.setItem(CALENDAR_LOCATION_KEY, saved))
			.catch(() => {});
	};
	const update = (patch: Partial<CalendarState>) => {
		state = { ...state, ...patch };
		for (const listener of listeners) listener();
	};
	const lookup = (
		city: CalendarCity,
		timezone: string,
		instant: Date,
		count: number,
		key: string,
	) => {
		const query = new URLSearchParams({
			latitude: String(city.latitude),
			longitude: String(city.longitude),
			timezone,
			instant: instant.toISOString(),
			days: String(count),
		});
		return api.request<CalendarResponse>(`/calendar/upcoming?${query}`, {
			public: true,
			cache: true,
			cacheKey: `calendar/${city.latitude}/${city.longitude}/${timezone}/${key}`,
		});
	};
	const schedule = () => {
		clearTimeout(timer);
		if (active && state.city)
			timer = setTimeout(
				() => void refresh(),
				calendarRefreshDelay(state.calendar),
			);
	};
	const refresh = async () => {
		if (!state.city || !state.restored || state.busy) return;
		const id = ++requestId;
		const { city, timezone } = state;
		update({ busy: true, error: null });
		try {
			const calendar = await lookup(city, timezone, new Date(), 14, "today");
			if (id === requestId) {
				update({ calendar });
				persist();
			}
		} catch (error) {
			if (id === requestId)
				update({
					error:
						error instanceof Error ? error.message : "Calendar unavailable",
				});
		} finally {
			if (id === requestId) {
				update({ busy: false });
				schedule();
			}
		}
	};
	const hydrate = () =>
		(restore ??= (async () => {
			const id = requestId;
			try {
				const value = await storage.getItem(CALENDAR_LOCATION_KEY);
				const saved = parseCalendarLocation(value);
				if (saved && id === requestId)
					update({
						...saved,
						calendar: parseSavedCalendar(value, saved.timezone),
					});
			} catch {
				/* Calendar selection still works when storage is unavailable. */
			} finally {
				update({ restored: true });
			}
		})());
	return {
		getSnapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		refresh,
		start: () => {
			active++;
			void hydrate().then(() => active && void refresh());
			return () => {
				active--;
				if (!active) clearTimeout(timer);
			};
		},
		selectCity: (city: CalendarCity) => {
			requestId++;
			update({ city, calendar: null, busy: false, error: null });
			persist();
			void refresh();
		},
		searchCities: async (query: string) =>
			(
				await api.request<{ cities: CalendarCity[] }>(
					`/calendar/locations?q=${encodeURIComponent(query.trim())}`,
					{ public: true },
				)
			).cities,
		day: (offset: number) => {
			if (!state.city) return Promise.reject(new Error("Choose a city first"));
			const instant = new Date();
			instant.setDate(instant.getDate() + offset);
			return lookup(
				state.city,
				state.timezone,
				instant,
				1,
				`day/${offset}/${instant.toISOString().slice(0, 10)}`,
			);
		},
		year: async (year: number) => {
			if (!state.city) throw new Error("Choose a city first");
			const { city, timezone } = state;
			const count = Math.round(
				(Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000,
			);
			const parts: CalendarResponse[] = [];
			// Keep each lookup within the existing API's 60-day range.
			for (let start = -1; start < count; start += 60)
				parts.push(
					await lookup(
						city,
						timezone,
						new Date(Date.UTC(year, 0, start + 1, 12)),
						Math.min(60, count - start + 1),
						`year/${year}/${start}`,
					),
				);
			return {
				...parts[0],
				days: [
					...new Map(
						parts
							.flatMap((part) => part.days)
							.filter((day) => day.civil_date.startsWith(`${year}-`))
							.map((day) => [day.civil_date, day]),
					).values(),
				].sort((a, b) => a.civil_date.localeCompare(b.civil_date)),
			};
		},
	};
}
