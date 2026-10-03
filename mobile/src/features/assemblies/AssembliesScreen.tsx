import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Switch, Text, View } from "react-native";
import { ChevronRight, Users } from "lucide-react-native";
import { CityPicker } from "./CityPicker";
import type {
	Assembly,
	MembershipRequest,
} from "@davar/shared/productContracts";
import { productApi, useSession } from "../account/session";
import { SignIn } from "../account/SignIn";
import {
	Action,
	Card,
	Copy,
	Field,
	Page,
	useProductStyle,
} from "../product/ui";
import { Onboarding } from "./Onboarding";
import { AssembliesEntry } from "./AssembliesEntry";

export default function AssembliesScreen() {
	return (
		<AssembliesEntry>
			<AssembliesContent />
		</AssembliesEntry>
	);
}

function AssembliesContent() {
	const { colors } = useProductStyle();
	const [changeCity, setChangeCity] = useState(false);
	const account = useSession((s) => s.account);
	const refresh = useSession((s) => s.refresh);
	const [code, setCode] = useState("");
	const [kind, setKind] = useState<"online" | "in_person">("in_person");
	const [radius, setRadius] = useState("25");
	const [assemblies, setAssemblies] = useState<Assembly[]>([]);
	const [people, setPeople] = useState<
		{ id: string; name: string; area: string }[]
	>([]);
	const [selected, setSelected] = useState<Assembly | null>(null);
	const [members, setMembers] = useState<MembershipRequest[]>([]);
	const [tab, setTab] = useState<"qahal" | "people" | "requests">("qahal");
	const [name, setName] = useState("");
	const [city, setCity] = useState("");
	const [meeting, setMeeting] = useState("");
	const [endorser, setEndorser] = useState("");
	const [leaders, setLeaders] = useState<
		{ id: string; name: string; city: string | null }[]
	>([]);
	const [endorsements, setEndorsements] = useState<
		{
			id: string;
			state: string;
			applicant_name: string;
			leader_name: string;
			can_decide: boolean;
		}[]
	>([]);
	const [notifications, setNotifications] = useState<
		{ id: string; kind: string }[]
	>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	async function run(action: () => Promise<void>) {
		setBusy(true);
		setError("");
		try {
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}
	const load = useCallback(async () => {
		const query = new URLSearchParams({
			kind,
			latitude: String(account?.profile.latitude ?? ""),
			longitude: String(account?.profile.longitude ?? ""),
			radius_km: radius,
			city: account?.profile.city || "",
		});
		const result = await productApi.request<{
			assemblies: Assembly[];
			people: { id: string; name: string; area: string }[];
		}>(`/assemblies?${query}`, { cache: true });
		setAssemblies(result.assemblies);
		setPeople(result.people);
	}, [
		kind,
		radius,
		account?.profile.city,
		account?.profile.latitude,
		account?.profile.longitude,
	]);
	useEffect(() => {
		setSelected(null);
		setAssemblies([]);
		setMembers([]);
		setPeople([]);
		setNotifications([]);
	}, [account?.id]);
	useEffect(() => {
		if (
			account?.admitted &&
			account.onboarding_complete &&
			(kind === "online" || !!account.profile.latitude)
		)
			void run(load);
	}, [
		account?.id,
		account?.admitted,
		account?.onboarding_complete,
		account?.profile.latitude,
		kind,
		load,
	]);
	async function open(assembly: Assembly) {
		const detail = await productApi.request<Assembly>(
			`/assemblies/${assembly.id}`,
		);
		setSelected(detail);
		setName(detail.name);
		setMeeting(detail.meeting_url || "");
		setCity(detail.city || "");
		if (detail.can_manage) {
			const result = await productApi.request<{
				memberships: MembershipRequest[];
			}>(`/assemblies/${detail.id}/members`);
			setMembers(result.memberships);
		}
	}
	return (
		<Page
			title={
				account?.admitted && !account.onboarding_complete ? "" : "Assemblies"
			}
		>
			{error ? <Copy>{error}</Copy> : null}
			{!account || !account.providers.length ? (
				<SignIn link={!!account} />
			) : !account.admitted ? (
				<Card>
					<Copy>Enter your invitation code to access Assemblies.</Copy>
					<Field label="Invitation code" value={code} onChange={setCode} />
					<Action
						label="Continue"
						disabled={busy}
						onPress={() =>
							void run(async () => {
								await productApi.request("/account/admission", {
									method: "POST",
									body: { code },
								});
								await refresh();
							})
						}
					/>
				</Card>
			) : !account.onboarding_complete ? (
				<Onboarding />
			) : (
				<>
					{selected ? (
						<>
							<Action
								label="Back to discovery"
								onPress={() => setSelected(null)}
							/>
							<Card>
								<Copy>{selected.name}</Copy>
								<Copy>
									{selected.city || "Online"} · {selected.member_state}
								</Copy>
								{selected.meeting_url ? (
									<Action
										label="Open meeting link"
										onPress={() => void Linking.openURL(selected.meeting_url!)}
									/>
								) : null}
								{!selected.can_manage &&
								selected.member_state === "not_member" ? (
									<Action
										label="Request to join"
										disabled={busy || account.profile.experience === "starting"}
										onPress={() =>
											void run(async () => {
												await productApi.request(
													`/assemblies/${selected.id}/join`,
													{ method: "POST" },
												);
												await open(selected);
											})
										}
									/>
								) : null}
								{!selected.can_manage &&
								selected.member_state !== "not_member" ? (
									<Action
										label={
											selected.member_state === "requested"
												? "Cancel request"
												: "Leave assembly"
										}
										onPress={() =>
											void run(async () => {
												await productApi.request(
													`/assemblies/${selected.id}/leave`,
													{ method: "DELETE" },
												);
												await open(selected);
											})
										}
									/>
								) : null}
							</Card>
							{selected.can_manage ? (
								<>
									{(["qahal", "people", "requests"] as const).map((item) => (
										<Action
											key={item}
											label={
												item === "requests"
													? "Requests (" +
														members.filter((m) => m.state === "requested")
															.length +
														")"
													: item
											}
											onPress={() => setTab(item)}
										/>
									))}
									{tab === "qahal" ? (
										<Card>
											<Field
												label="Assembly name"
												value={name}
												onChange={setName}
											/>
											<Copy>{selected.city}</Copy>
											<Field
												label="Meeting link (HTTPS)"
												value={meeting}
												onChange={setMeeting}
											/>
											<Action
												label="Save assembly"
												onPress={() =>
													void run(async () => {
														await productApi.request(
															`/assemblies/${selected.id}`,
															{
																method: "PATCH",
																body: { name, city, meeting_url: meeting },
															},
														);
														await open(selected);
													})
												}
											/>
										</Card>
									) : (
										members
											.filter(
												(m) =>
													m.state ===
													(tab === "people" ? "member" : "requested"),
											)
											.map((member) => (
												<Card key={member.id}>
													<Copy>{member.user.name}</Copy>
													{member.user.gender ? (
														<Copy>{member.user.gender}</Copy>
													) : null}
													{member.user.age !== null &&
													member.user.age !== undefined ? (
														<Copy>{member.user.age} years</Copy>
													) : null}
													{member.user.contact_url ? (
														<Action
															label="Contact on Telegram"
															onPress={() =>
																void Linking.openURL(member.user.contact_url!)
															}
														/>
													) : null}
													{member.state === "requested"
														? (["accepted", "declined"] as const).map(
																(decision) => (
																	<Action
																		key={decision}
																		label={
																			decision === "accepted"
																				? "Accept"
																				: "Decline"
																		}
																		disabled={busy}
																		onPress={() =>
																			void run(async () => {
																				await productApi.request(
																					`/assemblies/${selected.id}/memberships/${member.id}/decision`,
																					{
																						method: "POST",
																						body: { decision },
																					},
																				);
																				await open(selected);
																			})
																		}
																	/>
																),
															)
														: null}
												</Card>
											))
									)}
								</>
							) : null}
						</>
					) : (
						<>
							<View style={{ flexDirection: "row", gap: 8 }}>
								{(["in_person", "online"] as const).map((value) => (
									<Pressable
										key={value}
										accessibilityRole="tab"
										accessibilityState={{ selected: kind === value }}
										onPress={() => setKind(value)}
										style={{
											paddingVertical: 8,
											paddingHorizontal: 16,
											borderRadius: 999,
											backgroundColor:
												kind === value ? colors.primary : "transparent",
										}}
									>
										<Text
											style={{
												fontFamily: "Inter_600SemiBold",
												fontSize: 13,
												color:
													kind === value ? "#FFFFFF" : colors.textSecondary,
											}}
										>
											{value === "in_person" ? "Local" : "Online"}
										</Text>
									</Pressable>
								))}
							</View>
							{kind === "in_person" ? (
								<>
									<Pressable
										accessibilityRole="button"
										accessibilityLabel="Change city and radius"
										onPress={() => setChangeCity(!changeCity)}
									>
										<Text
											style={{
												fontFamily: "Inter_400Regular",
												fontSize: 12,
												color: colors.textSecondary,
											}}
										>
											{account.profile.city || "Select city"} · {radius} km
										</Text>
									</Pressable>
									{changeCity ? (
										<>
											<CityPicker />
											<View style={{ flexDirection: "row", gap: 8 }}>
												{["10", "25", "50", "100"].map((r) => (
													<Pressable
														key={r}
														onPress={() => setRadius(r)}
														style={{
															padding: 10,
															borderRadius: 20,
															backgroundColor:
																r === radius ? colors.primary : "transparent",
														}}
													>
														<Text
															style={{
																color:
																	r === radius
																		? "#FFFFFF"
																		: colors.textSecondary,
															}}
														>
															{r} km
														</Text>
													</Pressable>
												))}
											</View>
											<Action
												label="Search local assemblies"
												disabled={busy}
												onPress={() => void run(load)}
											/>
										</>
									) : null}
								</>
							) : null}
							<View>
								{assemblies.map((assembly) => (
									<Pressable
										key={assembly.id}
										accessibilityRole="button"
										accessibilityLabel={assembly.name}
										onPress={() => void run(() => open(assembly))}
										style={{
											flexDirection: "row",
											gap: 16,
											alignItems: "center",
											paddingVertical: 18,
											borderBottomWidth: 1,
											borderColor: colors.border,
										}}
									>
										<Users
											size={28}
											color={colors.primaryDeep}
											strokeWidth={1.7}
										/>
										<View style={{ flex: 1, gap: 4 }}>
											<Text
												style={{
													fontFamily: "Inter_600SemiBold",
													fontSize: 22,
													color: colors.textPrimary,
												}}
											>
												{assembly.name}
											</Text>
											<Text
												style={{
													fontFamily: "Inter_400Regular",
													fontSize: 13,
													color: colors.textSecondary,
												}}
											>
												{assembly.city || "Online"}
												{assembly.distance_km !== null
													? " · " + assembly.distance_km + " km"
													: ""}
												{assembly.can_manage ? " · Your Qahal" : ""}
											</Text>
										</View>
										<ChevronRight size={18} color={colors.textSecondary} />
									</Pressable>
								))}
							</View>
							{!assemblies.length ? (
								<Copy>No assemblies found for this search.</Copy>
							) : null}
							{people.map((person) => (
								<Card key={person.id}>
									<Copy>
										{person.name} · {person.area}
									</Copy>
								</Card>
							))}
							{account.leader_verified ? (
								<Card>
									<Copy>Create your Qahal</Copy>
									<Field label="Name" value={name} onChange={setName} />
									<Copy>
										{account.profile.city || "Select your city in onboarding."}
									</Copy>
									<Action
										label={"Create " + kind + " assembly"}
										disabled={busy || !name}
										onPress={() =>
											void run(async () => {
												const created = await productApi.request<Assembly>(
													"/assemblies",
													{ method: "POST", body: { name, kind, city } },
												);
												await open(created);
											})
										}
									/>
								</Card>
							) : account.profile.experience === "leader" ? (
								<Card>
									<Copy>
										Creation requires endorsement or operator verification.
									</Copy>
									<Field
										label="Find a verified leader"
										value={endorser}
										onChange={setEndorser}
									/>
									<Action
										label="Find leader"
										onPress={() =>
											void run(async () => {
												setLeaders(
													(
														await productApi.request<{
															leaders: typeof leaders;
														}>(
															`/assemblies/leaders?q=${encodeURIComponent(endorser)}`,
														)
													).leaders,
												);
											})
										}
									/>
									{leaders.map((leader) => (
										<Action
											key={leader.id}
											label={"Ask " + leader.name + " to endorse"}
											onPress={() =>
												void run(async () => {
													await productApi.request("/endorsements", {
														method: "POST",
														body: { leader_id: leader.id },
													});
													setLeaders([]);
												})
											}
										/>
									))}
								</Card>
							) : null}
						</>
					)}
					<Card>
						<Copy>
							Hidden by default. Allow nearby people to find your name and city.
						</Copy>
						<Switch
							accessibilityLabel="Discoverable"
							value={account.discoverable}
							onValueChange={(value) =>
								void run(async () => {
									await productApi.request("/account", {
										method: "PATCH",
										body: { discoverable: value },
									});
									await refresh();
								})
							}
						/>
					</Card>
					<Action
						label="Endorsements"
						onPress={() =>
							void run(async () => {
								setEndorsements(
									(
										await productApi.request<{
											endorsements: typeof endorsements;
										}>("/endorsements")
									).endorsements,
								);
							})
						}
					/>
					{endorsements.map((item) => (
						<Card key={item.id}>
							<Copy>
								{item.applicant_name} · {item.leader_name} · {item.state}
							</Copy>
							{item.state === "declined" ? (
								<Copy>Contact support before continuing verification.</Copy>
							) : null}
							{item.can_decide
								? (["accepted", "declined"] as const).map((state) => (
										<Action
											key={state}
											label={
												state === "accepted"
													? "Accept endorsement"
													: "Decline endorsement"
											}
											onPress={() =>
												void run(async () => {
													await productApi.request(`/endorsements/${item.id}`, {
														method: "PATCH",
														body: { state },
													});
													setEndorsements(
														(
															await productApi.request<{
																endorsements: typeof endorsements;
															}>("/endorsements")
														).endorsements,
													);
													await refresh();
												})
											}
										/>
									))
								: null}
						</Card>
					))}
					{account.settings.telegram_notifications === true ? (
						<Action
							label="Disable Telegram notifications"
							onPress={() =>
								void run(async () => {
									await productApi.request(
										"/account/notification_preferences",
										{ method: "PATCH", body: { enabled: false } },
									);
									await refresh();
								})
							}
						/>
					) : (
						<SignIn link telegramNotifications />
					)}
					<Action
						label="Notifications"
						onPress={() =>
							void run(async () => {
								const result = await productApi.request<{
									notifications: { id: string; kind: string }[];
								}>("/account/notifications");
								setNotifications(result.notifications);
							})
						}
					/>
					{notifications.map((n) => (
						<Copy key={n.id}>{n.kind.replaceAll("_", " ")}</Copy>
					))}
				</>
			)}
		</Page>
	);
}
