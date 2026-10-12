import type { CalendarState } from "./calendarClient";
import { calendarIsOutdated } from "./calendarRefresh";
import type { CalendarDay, CalendarResponse } from "./productContracts";
import type { AppLanguage } from "./translationConfig";

export const MOADIM = [
	{ id: "pesach", icon: "flame" },
	{ id: "hag_hamatzot", icon: "wheat" },
	{ id: "bikurim", icon: "sprout" },
	{ id: "shavuot", icon: "book-open" },
	{ id: "yom_teruah", icon: "megaphone" },
	{ id: "yom_hakipurim", icon: "heart" },
	{ id: "sukkot", icon: "tent" },
	{ id: "shemini_atzeret", icon: "users" },
] as const;
export type MoedId = (typeof MOADIM)[number]["id"];
export type CalendarIcon = (typeof MOADIM)[number]["icon"];

export function normalizeMoed(event: string): MoedId | null {
	const id =
		event === "hag_hamatzot_last"
			? "hag_hamatzot"
			: event === "sukkot_last"
				? "sukkot"
				: event;
	return MOADIM.find((moed) => moed.id === id)?.id ?? null;
}

export function localSunsetClock(
	sunsetAt: string | null | undefined,
	timeZone: string | null | undefined,
	language: AppLanguage,
): string | null {
	if (!sunsetAt || !timeZone) return null;
	const instant = new Date(sunsetAt);
	if (Number.isNaN(instant.getTime())) return null;
	try {
		return new Intl.DateTimeFormat(language, {
			hour: "numeric",
			minute: "2-digit",
			timeZone,
		}).format(instant);
	} catch {
		return null;
	}
}

export function confirmedMoadim(day: CalendarDay | undefined): MoedId[] {
	if (!day) return [];
	const observedMonth =
		day.biblical.day !== null &&
		day.month_status === "confirmed" &&
		(day.year_start_status === "confirmed" ||
			day.month_identity?.status === "manual");
	const counted = new Set(
		(day.counted_events ?? [])
			.filter((event) => event.status === "calculated")
			.map((event) => event.event_id),
	);
	return [
		...new Set(
			day.events
				.map(normalizeMoed)
				.filter(
					(id): id is MoedId =>
						id !== null &&
						(observedMonth ||
							((id === "bikurim" || id === "shavuot") && counted.has(id))),
				),
		),
	];
}

export function readingCalendarDay(
	calendar: CalendarResponse | null,
	showEveryDay: boolean,
	now = Date.now(),
): CalendarDay | null {
	const day = calendar?.days[0];
	if (
		!calendar ||
		calendarIsOutdated(calendar, now) ||
		!day ||
		day.biblical.day === null ||
		day.month_status !== "confirmed"
	)
		return null;
	return showEveryDay || confirmedMoadim(day).length > 0 ? day : null;
}

export type ReadingCalendarPill =
	| { kind: "day"; day: CalendarDay }
	| {
			kind: "status";
			messageKey:
				| "calendar.loading"
				| "calendar.chooseCityPill"
				| "calendar.dayUnavailable"
				| "calendar.awaitingConfirmation";
	  };

export function readingCalendarPill(
	state: Pick<CalendarState, "calendar" | "city" | "restored" | "busy" | "error">,
	showEveryDay: boolean,
	now = Date.now(),
): ReadingCalendarPill | null {
	const day = readingCalendarDay(state.calendar, showEveryDay, now);
	if (day) return { kind: "day", day };
	if (!showEveryDay) return null;
	if (!state.restored)
		return { kind: "status", messageKey: "calendar.loading" };
	if (!state.city)
		return { kind: "status", messageKey: "calendar.chooseCityPill" };
	if (state.busy && !state.calendar)
		return { kind: "status", messageKey: "calendar.loading" };
	if (
		state.error ||
		!state.calendar?.days[0] ||
		calendarIsOutdated(state.calendar, now)
	)
		return { kind: "status", messageKey: "calendar.dayUnavailable" };
	return { kind: "status", messageKey: "calendar.awaitingConfirmation" };
}

export function annualMoadim(calendar: CalendarResponse | null, year: number) {
	if (!calendar) return [];
	return MOADIM.map((moed) => ({
		...moed,
		days: calendar.days.filter(
			(day) =>
				day.civil_date.startsWith(`${year}-`) &&
				confirmedMoadim(day).includes(moed.id),
		),
	}));
}

export function calendarYear(timezone: string, now = new Date()): number {
	return Number(
		new Intl.DateTimeFormat("en", {
			timeZone: timezone,
			year: "numeric",
		}).format(now),
	);
}

export function calendarUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.href
			: null;
	} catch {
		return null;
	}
}

export function calendarSources(
	calendar: CalendarResponse | null,
	day = calendar?.days[0],
) {
	const sources: { id: string; name: string; url: string }[] = [];
	const site = calendarUrl(calendar?.source?.url);
	if (site && !calendar?.source?.development_fixture)
		sources.push({ id: "provider", name: calendar!.source!.name, url: site });
	const report = calendarUrl(
		day?.observation?.source_url ?? day?.counted_events?.[0]?.source_url,
	);
	if (
		report &&
		!day?.observation?.development_fixture &&
		!sources.some((source) => source.url === report)
	)
		sources.push({ id: "observation", name: "observation", url: report });
	return sources;
}
