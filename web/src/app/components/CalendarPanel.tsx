import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarResponse } from "@davar/shared/productContracts";
import {
	calendarIsOutdated,
	calendarRefreshDelay,
	calendarTime,
} from "@davar/shared/calendarRefresh";
import { productApi } from "../services/productApi";
import { CityChooser } from "./CityChooser";
import { NeumorphCard } from "./NeumorphCard";

type City = {
	city: string;
	country: string;
	latitude: number;
	longitude: number;
};

export function CalendarPanel({ language }: { language: "en" | "es" | "he" }) {
	const [city, setCity] = useState<City | null>(null);
	const [timezone, setTimezone] = useState(
		Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const [restored, setRestored] = useState(false);
	const requestId = useRef(0);
	useEffect(() => {
		try {
			const saved = JSON.parse(
				localStorage.getItem("davar-calendar-location") || "null",
			);
			if (
				typeof saved?.city?.city === "string" &&
				typeof saved.city.country === "string" &&
				typeof saved.city.latitude === "number" &&
				Math.abs(saved.city.latitude) <= 90 &&
				typeof saved.city.longitude === "number" &&
				Math.abs(saved.city.longitude) <= 180 &&
				typeof saved.timezone === "string"
			) {
				new Intl.DateTimeFormat("en", { timeZone: saved.timezone });
				setCity(saved.city);
				setTimezone(saved.timezone);
			}
		} catch {
			/* Storage may be disabled or contain an obsolete selection. */
		}
		setRestored(true);
	}, []);
	useEffect(() => {
		if (!restored || !city) return;
		try {
			localStorage.setItem(
				"davar-calendar-location",
				JSON.stringify({ city, timezone }),
			);
		} catch {
			/* Reading still works without storage. */
		}
	}, [city, timezone, restored]);
	const load = useCallback(async () => {
		if (!city || !restored) return;
		const id = ++requestId.current;
		setBusy(true);
		setError("");
		try {
			const query = new URLSearchParams({
				latitude: String(city.latitude),
				longitude: String(city.longitude),
				timezone,
				instant: new Date().toISOString(),
				days: "14",
			});
			const result = await productApi.request<CalendarResponse>(
				`/calendar/upcoming?${query}`,
				{
					public: true,
					cache: true,
					cacheKey: `calendar/${city.latitude}/${city.longitude}/${timezone}`,
				},
			);
			if (id === requestId.current) setCalendar(result);
		} catch (e) {
			if (id === requestId.current)
				setError(e instanceof Error ? e.message : "Calendar unavailable");
		} finally {
			if (id === requestId.current) {
				setBusy(false);
				setAttempt((value) => value + 1);
			}
		}
	}, [city, timezone, restored]);
	useEffect(() => {
		setCalendar(null);
		void load();
		const resume = () => {
			if (!document.hidden) void load();
		};
		window.addEventListener("focus", resume);
		window.addEventListener("online", resume);
		document.addEventListener("visibilitychange", resume);
		return () => {
			requestId.current++;
			window.removeEventListener("focus", resume);
			window.removeEventListener("online", resume);
			document.removeEventListener("visibilitychange", resume);
		};
	}, [load]);
	useEffect(() => {
		if (!city || !restored) return;
		const timer = setTimeout(() => {
			if (!document.hidden) void load();
		}, calendarRefreshDelay(calendar));
		return () => clearTimeout(timer);
	}, [city, restored, calendar, attempt, load]);
	const today = calendar?.days[0];
	const sunset = calendarTime(calendar?.next_sunset_at, timezone, language);
	return (
		<>
			<p>
				Your city is remembered on this device. The Biblical day changes at
				local sunset.
			</p>
			{city ? (
				<p>
					{city.city}, {city.country}
				</p>
			) : null}
			<CityChooser
				onChoose={async (chosen) => {
					setCity(chosen);
				}}
			/>
			<label className="flex flex-col gap-2">
				Timezone
				<input
					aria-label="Timezone"
					className="rounded-xl p-3 border border-[var(--neomorph-border)] bg-[var(--neomorph-bg)]"
					value={timezone}
					onChange={(event) => setTimezone(event.target.value)}
				/>
			</label>
			<button
				type="button"
				disabled={busy || !city}
				onClick={() => void load()}
				className="rounded-full px-5 py-3 border border-[var(--primary)] disabled:opacity-50"
			>
				{busy ? "Loading…" : "Refresh calendar"}
			</button>
			{error ? <p role="status">{error}</p> : null}
			{calendar ? (
				<>
					{calendarIsOutdated(calendar) ? (
						<p role="status">
							Showing a cached calendar. Reconnect to update the day.
						</p>
					) : null}
					{calendar.source?.development_fixture ? (
						<p>Development scenario — synthetic observations.</p>
					) : null}
					{calendar.source?.stale ? (
						<p role="status">
							{calendar.source.last_synced_at
								? "Observation updates are unavailable. Showing the last imported evidence."
								: "Awaiting the first observation update."}
						</p>
					) : null}
					{sunset ? (
						<p>
							Next sunset: {sunset} · {timezone}
						</p>
					) : null}
					<p>
						Aviv determination: {calendar.year_start_status}. Appointed times
						that depend on it remain unresolved.
					</p>
					<details className="rounded-xl p-4 border border-[var(--neomorph-border)] space-y-3">
						<summary className="cursor-pointer">Observation details</summary>
						{today?.observation ? (
							<>
								<p>
									Observed on {today.observation.observed_on} · Unaided sighting
									in Israel
								</p>
								<p>{today.observation.observers.join(", ")}</p>
								<p>{today.observation.locations.join(", ")}</p>
								{!today.observation.development_fixture ? (
									<a
										className="underline"
										href={today.observation.source_url}
										target="_blank"
										rel="noreferrer"
									>
										Read observation report
									</a>
								) : null}
							</>
						) : (
							<p>No confirmed observation for this day.</p>
						)}
						{calendar.source?.last_synced_at ? (
							<p>
								Observations checked:{" "}
								{new Date(calendar.source.last_synced_at).toLocaleString(
									language,
								)}
							</p>
						) : null}
						{calendar.source && calendar.source.review_count > 0 ? (
							<p>
								Some historical reports need review. Only confirmed evidence is
								used.
							</p>
						) : null}
						{calendar.source?.url ? (
							<a
								className="underline block"
								href={calendar.source.url}
								target="_blank"
								rel="noreferrer"
							>
								Israeli New Moon Society
							</a>
						) : null}
					</details>
				</>
			) : null}
			{calendar?.days.map((day) => (
				<NeumorphCard key={day.civil_date} className="p-6 space-y-2">
					<h2>{day.civil_date}</h2>
					<p>
						{day.biblical.day === null
							? "Awaiting confirmed observation"
							: `Biblical day ${day.biblical.day} · ${day.biblical.month_id || "Month identity unresolved"}`}
					</p>
					<p>
						Rabbinic: {day.rabbinic.day} {day.rabbinic.month_id}{" "}
						{day.rabbinic.year}
					</p>
					<p>{day.events.join(", ")}</p>
				</NeumorphCard>
			))}
		</>
	);
}
