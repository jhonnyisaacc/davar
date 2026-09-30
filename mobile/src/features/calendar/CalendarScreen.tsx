import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Calendar, ChevronRight, MapPin } from "lucide-react-native";
import type { CalendarResponse } from "@davar/shared/productContracts";
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
	const { colors } = useProductStyle();
	const [detail, setDetail] = useState(false);
	const [city, setCity] = useState<City | null>(
		profile?.latitude && profile.longitude
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
	const load = useCallback(
		async (chosen: City) => {
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
				setCalendar(
					await productApi.request<CalendarResponse>(
						`/calendar/upcoming?${params}`,
						{
							public: true,
							cache: true,
							cacheKey: `calendar/${chosen.latitude}/${chosen.longitude}/${timezone}`,
						},
					),
				);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Calendar unavailable");
			} finally {
				setBusy(false);
			}
		},
		[timezone],
	);
	useEffect(() => {
		if (city) void load(city);
	}, [city, load]);
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
								Your city is used for local sunset. It is not saved to your
								account.
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
							<Copy>
								Rabbinic: {today.rabbinic.day} {today.rabbinic.month_id}{" "}
								{today.rabbinic.year}
							</Copy>
						</Card>
					) : null}
					{calendar ? (
						<>
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
