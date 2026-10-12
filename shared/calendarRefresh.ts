import type { CalendarResponse } from "./productContracts";

const REFRESH_INTERVAL = 15 * 60 * 1000;

// The server supplies the sunset boundary; clients only schedule a new lookup.
export function calendarRefreshDelay(calendar: CalendarResponse | null, now = Date.now()): number {
	if (!calendar) return 60_000;
	const generated = Date.parse(calendar.generated_at || "");
	const sunset = Date.parse(calendar.next_sunset_at || "");
	const deadlines = [now + REFRESH_INTERVAL];
	if (Number.isFinite(generated)) deadlines.push(generated + REFRESH_INTERVAL);
	if (Number.isFinite(sunset)) deadlines.push(sunset + 1_000);
	const delay = Math.min(...deadlines) - now;
	return delay <= 0 ? 60_000 : Math.max(1_000, delay);
}

export function calendarIsOutdated(calendar: CalendarResponse, now = Date.now()): boolean {
	const generated = Date.parse(calendar.generated_at || "");
	const sunset = Date.parse(calendar.next_sunset_at || "");
	return (Number.isFinite(generated) && now - generated >= REFRESH_INTERVAL) ||
		(Number.isFinite(sunset) && now >= sunset);
}

export function calendarTime(instant: string | undefined, timezone: string, locale: string): string {
	if (!instant) return "";
	try {
		return new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(instant));
	} catch {
		return "";
	}
}
