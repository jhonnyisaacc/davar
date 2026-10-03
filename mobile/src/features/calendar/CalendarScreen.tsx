import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { Calendar, ChevronRight, MapPin } from "lucide-react-native";
import type { CalendarResponse } from "@davar/shared/productContracts";
import {
	calendarIsOutdated,
	calendarRefreshDelay,
	calendarTime,
} from "@davar/shared/calendarRefresh";
import { productApi, useSession } from "../account/session";
import {
	Action,
	Card,
	Copy,
	Field,
	Page,
	useProductStyle,
} from "../product/ui";
type City = {
	city: string;
	country: string;
	latitude: number;
	longitude: number;
};
export default function CalendarScreen() {
	const profile = useSession((s) => s.account?.profile);
	const { colors, language } = useProductStyle();
	const [detail, setDetail] = useState(false);
	const [city, setCity] = useState<City | null>(
		typeof profile?.latitude === "number" &&
			typeof profile.longitude === "number"
			? {
					city: profile.city || "",
					country: "",
					latitude: profile.latitude,
					longitude: profile.longitude,
				}
			: null,
	);
	const [query, setQuery] = useState("");
	const [cities, setCities] = useState<City[]>([]);
	const [timezone, setTimezone] = useState(
		Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [location, setLocation] = useState(false);
	const [observationsOpen, setObservationsOpen] = useState(false);
	const [focused, setFocused] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const [restored, setRestored] = useState(false);
	const requestId = useRef(0);
	useEffect(() => {
		let mounted = true;
		void AsyncStorage.getItem("davar-calendar-location")
			.then((value) => {
				if (!value || !mounted) return;
				const saved = JSON.parse(value);
				if (
					typeof saved.city?.city === "string" &&
					typeof saved.city?.country === "string" &&
					typeof saved.city?.latitude === "number" &&
					Math.abs(saved.city.latitude) <= 90 &&
					typeof saved.city?.longitude === "number" &&
					Math.abs(saved.city.longitude) <= 180 &&
					typeof saved.timezone === "string"
				) {
					new Intl.DateTimeFormat("en", { timeZone: saved.timezone });
					setCity(saved.city);
					setTimezone(saved.timezone);
				}
			})
			.catch(() => {})
			.finally(() => {
				if (mounted) setRestored(true);
			});
		return () => {
			mounted = false;
		};
	}, []);
	useEffect(() => {
		if (restored && city)
			void AsyncStorage.setItem(
				"davar-calendar-location",
				JSON.stringify({ city, timezone }),
			).catch(() => {});
	}, [city, timezone, restored]);
	const load = useCallback(
		async (chosen: City) => {
			const id = ++requestId.current;
			setBusy(true);
			setError("");
			try {
				const params = new URLSearchParams({
					latitude: String(chosen.latitude),
					longitude: String(chosen.longitude),
					timezone,
					instant: new Date().toISOString(),
					days: "14",
				});
				const result = await productApi.request<CalendarResponse>(
					`/calendar/upcoming?${params}`,
					{
						public: true,
						cache: true,
						cacheKey: `calendar/${chosen.latitude}/${chosen.longitude}/${timezone}`,
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
		},
		[timezone],
	);
	useFocusEffect(
		useCallback(() => {
			setFocused(true);
			setCalendar(null);
			if (city && restored) void load(city);
			const subscription = AppState.addEventListener("change", (state) => {
				if (state === "active" && city && restored) void load(city);
			});
			return () => {
				setFocused(false);
				requestId.current++;
				subscription.remove();
			};
		}, [city, load, restored]),
	);
	useEffect(() => {
		if (!focused || !city || !restored) return;
		const timer = setTimeout(
			() => void load(city),
			calendarRefreshDelay(calendar),
		);
		return () => clearTimeout(timer);
	}, [focused, city, restored, calendar, attempt, load]);
	async function search() {
		setBusy(true);
		setError("");
		try {
			setCities(
				(
					await productApi.request<{ cities: City[] }>(
						`/calendar/locations?q=${encodeURIComponent(query)}`,
						{ public: true },
					)
				).cities,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "City search unavailable");
		} finally {
			setBusy(false);
		}
	}
	const today = calendar?.days[0];
	const sunset = calendarTime(calendar?.next_sunset_at, timezone, language);
	return (
		<Page title={detail ? "Biblical Calendar" : "Widgets"}>
			{error ? <Copy>{error}</Copy> : null}
			{!detail ? (
				<>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Open Biblical Calendar"
						onPress={() => setDetail(true)}
						style={{ alignSelf: "flex-start", width: 200 }}
					>
						<Card>
							<Text
								style={{
									fontFamily: "Manrope_600SemiBold",
									fontSize: 42,
									color: colors.textPrimary,
								}}
							>
								{today?.biblical.day ?? "—"}
							</Text>
							<Text
								style={{
									fontFamily: "Inter_500Medium",
									fontSize: 14,
									color: colors.primaryDeep,
								}}
							>
								Day of the month
							</Text>
							<Text
								style={{
									fontFamily: "Inter_400Regular",
									fontSize: 12,
									color: colors.textSecondary,
								}}
							>
								{today ? "Changes at local sunset" : "Choose your city"}
							</Text>
						</Card>
					</Pressable>
					<View
						style={{
							padding: 16,
							gap: 4,
							borderRadius: 12,
							backgroundColor: colors.surfaceElevated,
						}}
					>
						<Copy>More widgets</Copy>
						<Text style={{ fontSize: 12, color: colors.textSecondary }}>
							More ways to study, coming soon.
						</Text>
					</View>
				</>
			) : (
				<>
					<Action label="Back to Widgets" onPress={() => setDetail(false)} />
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Choose calendar city"
						onPress={() => setLocation(!location)}
						style={{
							flexDirection: "row",
							gap: 8,
							alignItems: "center",
							paddingVertical: 12,
						}}
					>
						<MapPin size={18} color={colors.primaryDeep} />
						<Copy>
							{city ? `${city.city} · ${timezone}` : "Choose your city"}
						</Copy>
						<ChevronRight size={16} color={colors.textSecondary} />
					</Pressable>
					{location || !city ? (
						<>
							<Copy>
								Your city is remembered on this device for local sunset.
							</Copy>
							<Field label="Search city" value={query} onChange={setQuery} />
							<Action
								label="Find city"
								disabled={busy || query.length < 2}
								onPress={() => void search()}
							/>
							{cities.map((c) => (
								<Action
									key={`${c.city}/${c.country}/${c.latitude}`}
									label={`${c.city}, ${c.country}`}
									onPress={() => {
										setCity(c);
										setCities([]);
										setLocation(false);
									}}
								/>
							))}
							<Field label="Timezone" value={timezone} onChange={setTimezone} />
						</>
					) : null}
					{today ? (
						<Card>
							<Text
								style={{
									fontFamily: "Manrope_600SemiBold",
									fontSize: 42,
									color: colors.textPrimary,
								}}
							>
								{today.biblical.day ?? "—"}
							</Text>
							<Copy>
								{today.biblical.day === null
									? "Awaiting a confirmed observation"
									: "Day of the month"}
							</Copy>
							<Copy>
								{today.civil_date} ·{" "}
								{today.biblical.month_id || "Month identity unresolved"}
							</Copy>
							{sunset ? (
								<Copy>
									Next sunset: {sunset} · {timezone}
								</Copy>
							) : null}
							<Copy>
								Rabbinic: {today.rabbinic.day} {today.rabbinic.month_id}{" "}
								{today.rabbinic.year}
							</Copy>
						</Card>
					) : null}
					{calendar ? (
						<>
							{calendarIsOutdated(calendar) ? (
								<Copy>
									Showing a cached calendar. Reconnect to update the day.
								</Copy>
							) : null}
							{calendar.source?.development_fixture ? (
								<Copy>Development scenario — synthetic observations.</Copy>
							) : null}
							{calendar.source?.stale ? (
								<Copy>
									{calendar.source.last_synced_at
										? "Observation updates are unavailable. Showing the last imported evidence."
										: "Awaiting the first observation update."}
								</Copy>
							) : null}
							{calendar.source && calendar.source.review_count > 0 ? (
								<Copy>
									Some historical reports need review. Only confirmed evidence
									is used.
								</Copy>
							) : null}
							{calendar.source?.last_synced_at ? (
								<Copy>
									Observations checked:{" "}
									{new Date(calendar.source.last_synced_at).toLocaleString(
										language,
									)}
								</Copy>
							) : null}
							<Action
								label={
									observationsOpen
										? "Hide observation details"
										: "Observation details"
								}
								onPress={() => setObservationsOpen(!observationsOpen)}
							/>
							{observationsOpen ? (
								<Card>
									{today?.observation ? (
										<>
											<Copy>
												Observed on {today.observation.observed_on} · Unaided
												sighting in Israel
											</Copy>
											<Copy>{today.observation.observers.join(", ")}</Copy>
											<Copy>{today.observation.locations.join(", ")}</Copy>
											{!today.observation.development_fixture ? (
												<Action
													label="Read observation report"
													onPress={() =>
														void Linking.openURL(today.observation!.source_url)
													}
												/>
											) : null}
										</>
									) : (
										<Copy>No confirmed observation for this day.</Copy>
									)}
									{calendar.source?.url ? (
										<Action
											label="Israeli New Moon Society"
											onPress={() =>
												void Linking.openURL(calendar.source!.url!)
											}
										/>
									) : null}
								</Card>
							) : null}
							<Copy>Observation and year start</Copy>
							<Copy>
								Aviv determination: {calendar.year_start_status}. Appointed
								times that depend on it remain unresolved.
							</Copy>
							<Action
								label={busy ? "Loading…" : "Refresh calendar"}
								disabled={busy || !city}
								onPress={() => city && void load(city)}
							/>
							<Copy>Upcoming</Copy>
							{calendar.days.slice(1).map((day) => (
								<View
									key={day.civil_date}
									style={{
										flexDirection: "row",
										gap: 12,
										paddingVertical: 12,
										borderBottomWidth: 1,
										borderColor: colors.border,
									}}
								>
									<Calendar size={18} color={colors.primaryDeep} />
									<View style={{ flex: 1, gap: 4 }}>
										<Copy>
											{day.civil_date} ·{" "}
											{day.biblical.day === null
												? "Pending observation"
												: `Day ${day.biblical.day}`}
										</Copy>
										<Text style={{ fontSize: 12, color: colors.textSecondary }}>
											{day.events.join(", ") || day.month_status}
										</Text>
									</View>
								</View>
							))}
						</>
					) : null}
				</>
			)}
		</Page>
	);
}
