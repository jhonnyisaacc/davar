import { calendarRefreshDelay } from "./calendarRefresh";
import type { ProductClient } from "./productClient";
import type { CalendarResponse } from "./productContracts";

export const CALENDAR_LOCATION_KEY = "davar-calendar-location";
const CITY_SEARCH_CACHE_TTL = 24 * 60 * 60 * 1000;
const CITY_SEARCH_CACHE_LIMIT = 100;
const ANNUAL_CACHE_TTL = 15 * 60 * 1000;
const DAY_WINDOW = 14;
const DAY_WINDOW_LEAD = 6;

function addCivilDays(civilDate: string, days: number): string {
	const [year, month, day] = civilDate.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day + days))
		.toISOString()
		.slice(0, 10);
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(instant);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value);
	return (
		Date.UTC(
			value("year"),
			value("month") - 1,
			value("day"),
			value("hour"),
			value("minute"),
			value("second"),
		) - instant.getTime()
	);
}

function civilNoon(civilDate: string, timeZone: string): Date {
	const [year, month, day] = civilDate.split("-").map(Number);
	const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
	const offset = timeZoneOffsetMs(utcNoon, timeZone);
	const noon = new Date(utcNoon.getTime() - offset);
	const settled = timeZoneOffsetMs(noon, timeZone);
	return settled === offset ? noon : new Date(utcNoon.getTime() - settled);
}
const normalizeCityQuery = (query: string) =>
	query.trim().replace(/\s+/g, " ").normalize("NFC").toLowerCase();
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
	let annualGeneration = 0;
	let annualCache: {
		key: string;
		calendar: CalendarResponse;
		savedAt: number;
	} | null = null;
	const pendingYears = new Map<string, Promise<CalendarResponse>>();
	const yearKey = (year: number) =>
		`${state.city?.latitude}/${state.city?.longitude}/${state.timezone}/${year}`;
	const cachedYear = (year: number) => {
		if (
			!state.city ||
			annualCache?.key !== yearKey(year) ||
			Date.now() - annualCache.savedAt >= ANNUAL_CACHE_TTL
		)
			return undefined;
		return annualCache.calendar;
	};
	const invalidateYears = () => {
		annualGeneration++;
		annualCache = null;
		pendingYears.clear();
	};
	type SavedDay = {
		day: CalendarResponse["days"][number];
		timezone?: string;
		generatedAt?: string;
		nextSunsetAt?: string;
	};
	let dayGeneration = 0;
	const dayCache = new Map<string, SavedDay>();
	let dayWindow: {
		key: string;
		start: string;
		promise: Promise<CalendarResponse>;
	} | null = null;
	const placeKey = (city: CalendarCity, timezone: string) =>
		`${city.latitude}/${city.longitude}/${timezone}`;
	const dayResponse = (
		saved: SavedDay,
		timezone: string,
	): CalendarResponse => ({
		schema_version: 1,
		days: [saved.day],
		year_start_status: saved.day.year_start_status,
		timezone: saved.timezone ?? timezone,
		generated_at: saved.generatedAt,
		next_sunset_at: saved.nextSunsetAt,
	});
	const writeDays = (
		city: CalendarCity,
		timezone: string,
		calendar: CalendarResponse,
		generation: number,
	) => {
		if (generation !== dayGeneration) return;
		const prefix = placeKey(city, timezone);
		for (const day of calendar.days) {
			dayCache.set(`${prefix}/${day.civil_date}`, {
				day,
				timezone: calendar.timezone ?? timezone,
				generatedAt: calendar.generated_at,
				nextSunsetAt: calendar.next_sunset_at,
			});
		}
	};
	const invalidateDays = () => {
		dayGeneration++;
		dayCache.clear();
		dayWindow = null;
	};
	const replaceDays = (
		city: CalendarCity,
		timezone: string,
		calendar: CalendarResponse,
	) => {
		invalidateDays();
		writeDays(city, timezone, calendar, dayGeneration);
	};
	const cachedDay = (offset: number): CalendarResponse | undefined => {
		const anchor = state.calendar?.days[0]?.civil_date;
		if (!state.city || !anchor) return undefined;
		const saved = dayCache.get(
			`${placeKey(state.city, state.timezone)}/${addCivilDays(anchor, offset)}`,
		);
		return saved ? dayResponse(saved, state.timezone) : undefined;
	};
	const finishWindow = (
		request: Promise<CalendarResponse>,
		city: CalendarCity,
		timezone: string,
		generation: number,
		target: string,
	) =>
		request.then(
			(calendar) => {
				if (dayWindow?.promise === request) dayWindow = null;
				writeDays(city, timezone, calendar, generation);
				const day = calendar.days.find((item) => item.civil_date === target);
				if (!day) throw new Error("Calendar day unavailable");
				return dayResponse(
					{
						day,
						timezone: calendar.timezone ?? timezone,
						generatedAt: calendar.generated_at,
						nextSunsetAt: calendar.next_sunset_at,
					},
					timezone,
				);
			},
			(error: unknown) => {
				if (dayWindow?.promise === request) dayWindow = null;
				throw error;
			},
		);
	// Public search results survive picker remounts; signed account selections are separate.
	const citySearches = new Map<
		string,
		{ cities: CalendarCity[]; savedAt: number }
	>();
	const pendingCitySearches = new Map<string, Promise<CalendarCity[]>>();
	const cachedCities = (query: string) => {
		const key = normalizeCityQuery(query);
		const cached = citySearches.get(key);
		if (!cached) return undefined;
		if (Date.now() - cached.savedAt >= CITY_SEARCH_CACHE_TTL) {
			citySearches.delete(key);
			return undefined;
		}
		citySearches.delete(key);
		citySearches.set(key, cached);
		return cached.cities;
	};
	const searchCities = (query: string): Promise<CalendarCity[]> => {
		const key = normalizeCityQuery(query);
		const cached = cachedCities(key);
		if (cached) return Promise.resolve(cached);
		const pending = pendingCitySearches.get(key);
		if (pending) return pending;
		const search = api
			.request<{ cities: CalendarCity[] }>(
				`/calendar/locations?q=${encodeURIComponent(key)}`,
				{ public: true },
			)
			.then(({ cities }) => {
				citySearches.delete(key);
				citySearches.set(key, { cities, savedAt: Date.now() });
				if (citySearches.size > CITY_SEARCH_CACHE_LIMIT) {
					const oldestKey = citySearches.keys().next().value;
					if (oldestKey !== undefined) citySearches.delete(oldestKey);
				}
				return cities;
			})
			.finally(() => pendingCitySearches.delete(key));
		pendingCitySearches.set(key, search);
		return search;
	};
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
		refreshSource = true,
	) => {
		const query = new URLSearchParams({
			latitude: String(city.latitude),
			longitude: String(city.longitude),
			timezone,
			instant: instant.toISOString(),
			days: String(count),
		});
		if (!refreshSource) query.set("refresh", "0");
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
				invalidateYears();
				replaceDays(city, timezone, calendar);
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
				if (saved && id === requestId) {
					const calendar = parseSavedCalendar(value, saved.timezone);
					update({ ...saved, calendar });
					if (calendar)
						writeDays(saved.city, saved.timezone, calendar, dayGeneration);
				}
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
			invalidateYears();
			invalidateDays();
			update({ city, calendar: null, busy: false, error: null });
			persist();
			void refresh();
		},
		cachedCities,
		searchCities,
		cachedDay,
		day: (offset: number) => {
			if (!state.city) return Promise.reject(new Error("Choose a city first"));
			const cached = cachedDay(offset);
			if (cached) return Promise.resolve(cached);
			const { city, timezone } = state;
			const anchor = state.calendar?.days[0]?.civil_date;
			const generation = dayGeneration;
			if (!anchor) {
				const instant = new Date();
				instant.setDate(instant.getDate() + offset);
				return lookup(
					city,
					timezone,
					instant,
					DAY_WINDOW,
					`day/open/${offset}`,
					false,
				).then((calendar) => {
					writeDays(city, timezone, calendar, generation);
					const day = calendar.days[0];
					if (!day) throw new Error("Calendar day unavailable");
					return dayResponse(
						{
							day,
							timezone: calendar.timezone ?? timezone,
							generatedAt: calendar.generated_at,
							nextSunsetAt: calendar.next_sunset_at,
						},
						timezone,
					);
				});
			}
			const target = addCivilDays(anchor, offset);
			const key = placeKey(city, timezone);
			if (
				dayWindow &&
				dayWindow.key === key &&
				target >= dayWindow.start &&
				target < addCivilDays(dayWindow.start, DAY_WINDOW)
			) {
				return finishWindow(
					dayWindow.promise,
					city,
					timezone,
					generation,
					target,
				);
			}
			const start = addCivilDays(target, -DAY_WINDOW_LEAD);
			const request = lookup(
				city,
				timezone,
				civilNoon(start, timezone),
				DAY_WINDOW,
				`day/${start}`,
				false,
			);
			dayWindow = { key, start, promise: request };
			return finishWindow(request, city, timezone, generation, target);
		},
		cachedYear,
		year: (year: number): Promise<CalendarResponse> => {
			if (!state.city) return Promise.reject(new Error("Choose a city first"));
			const cached = cachedYear(year);
			if (cached) return Promise.resolve(cached);
			const key = yearKey(year);
			const pending = pendingYears.get(key);
			if (pending) return pending;
			const generation = annualGeneration;
			const { city, timezone } = state;
			const count = Math.round(
				(Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000,
			);
			const lookups: Promise<CalendarResponse>[] = [];
			// Fetch independent chunks together within the existing API's 60-day range.
			for (let start = -1; start < count; start += 60)
				lookups.push(
					lookup(
						city,
						timezone,
						new Date(Date.UTC(year, 0, start + 1, 12)),
						Math.min(60, count - start + 1),
						`year/${year}/${start}`,
					),
				);
			const request = Promise.all(lookups)
				.then((parts) => {
					const calendar = {
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
					if (generation === annualGeneration)
						annualCache = { key, calendar, savedAt: Date.now() };
					return calendar;
				})
				.finally(() => {
					if (pendingYears.get(key) === request) pendingYears.delete(key);
				});
			pendingYears.set(key, request);
			return request;
		},
	};
}
