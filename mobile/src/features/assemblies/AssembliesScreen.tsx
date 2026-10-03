import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, Switch, Text, View } from "react-native";
import { ChevronRight, Users } from "lucide-react-native";
import {
	assemblyMembershipLabel,
	assembliesErrorMessage,
	canCreateAssembly,
	canRequestAssembly,
	hasAssemblyLocation,
} from "@davar/shared/assembliesPresentation";
import { CityPicker } from "./CityPicker";
import type {
	Assembly,
	MembershipRequest,
} from "@davar/shared/productContracts";
import { productApi, useSession } from "../account/session";
import { SignIn } from "../account/SignIn";
import {
	Action,
	Busy,
	Card,
	Copy,
	Field,
	Page,
	useProductStyle,
} from "../product/ui";
import { Onboarding } from "./Onboarding";
import { AssembliesEntry } from "./AssembliesEntry";

export default function AssembliesScreen() {
	const accountId = useSession((s) => s.account?.id);
	return (
		<AssembliesEntry>
			<AssembliesContent key={accountId || "guest"} />
		</AssembliesEntry>
	);
}

function AssembliesContent() {
	const { colors, rtl } = useProductStyle();
	const searchVersion = useRef(0);
	const actionPending = useRef(false);
	const [searching, setSearching] = useState(false);
	const [searched, setSearched] = useState(false);
	const [creationName, setCreationName] = useState("");
	const [changeCity, setChangeCity] = useState(false);
	const account = useSession((s) => s.account);
	const refresh = useSession((s) => s.refresh);
	const [code, setCode] = useState("");
	const [kind, setKind] = useState<"online" | "in_person">("in_person");
	const [radius, setRadius] = useState("25");
	const [assemblies, setAssemblies] = useState<Assembly[]>([]);
	const [people, setPeople] = useState<
		{ id: string; name: string; area: string; contact_url?: string | null }[]
	>([]);
	const [selected, setSelected] = useState<Assembly | null>(null);
	const [members, setMembers] = useState<MembershipRequest[]>([]);
	const [tab, setTab] = useState<"qahal" | "people" | "requests">("qahal");
	const [name, setName] = useState("");
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
		if (actionPending.current) return;
		actionPending.current = true;
		setBusy(true);
		setError("");
		try {
			await action();
		} catch (e) {
			setError(assembliesErrorMessage(e));
		} finally {
			actionPending.current = false;
			setBusy(false);
		}
	}
	const searchLatitude = account?.profile.latitude;
	const searchLongitude = account?.profile.longitude;
	const searchCity = account?.profile.city;
	const load = useCallback(async () => {
		const version = ++searchVersion.current;
		setSearching(true);
		setSearched(false);
		setAssemblies([]);
		setPeople([]);
		setError("");
		try {
			const query = new URLSearchParams({
				kind,
				latitude: String(searchLatitude ?? ""),
				longitude: String(searchLongitude ?? ""),
				radius_km: radius,
				city: searchCity || "",
			});
			const result = await productApi.request<{
				assemblies: Assembly[];
				people: {
					id: string;
					name: string;
					area: string;
					contact_url?: string | null;
				}[];
			}>(`/assemblies?${query}`, { cache: true });
			if (version === searchVersion.current) {
				setAssemblies(result.assemblies);
				setPeople(result.people);
				setSearched(true);
			}
		} catch (cause) {
			if (version === searchVersion.current)
				setError(assembliesErrorMessage(cause));
		} finally {
			if (version === searchVersion.current) setSearching(false);
		}
	}, [
		kind,
		radius,
		searchCity,
		searchLatitude,
		searchLongitude,
	]);
	useEffect(() => {
		if (
			account?.admitted &&
			account.onboarding_complete &&
			(kind === "online" || hasAssemblyLocation(account.profile))
		)
			void load();
		return () => {
			searchVersion.current++;
		};
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
		if (detail.can_manage) {
			const result = await productApi.request<{
				memberships: MembershipRequest[];
			}>(`/assemblies/${detail.id}/members`);
			setMembers(result.memberships);
		} else {
			setMembers([]);
		}
		setSelected(detail);
		setName(detail.name);
		setMeeting(detail.meeting_url || "");
	}
	return (
		<Page
			title={
				account?.admitted && !account.onboarding_complete ? "" : "Assemblies"
			}
		>
			{error ? (
				<Text
					accessibilityRole="alert"
					style={{
						color: colors.textPrimary,
						writingDirection: rtl ? "rtl" : "ltr",
					}}
				>
					{error}
				</Text>
			) : null}
			{busy || searching ? <Busy /> : null}
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
									{selected.city || "Online"} ·{" "}
									{assemblyMembershipLabel(selected.member_state)}
								</Copy>
								{selected.meeting_url ? (
									<Action
										label="Open meeting link"
										disabled={busy}
										onPress={() =>
											void run(() => Linking.openURL(selected.meeting_url!))
										}
									/>
								) : null}
								{canRequestAssembly(account, selected) ? (
									<Action
										label="Request to join"
										disabled={busy}
										onPress={() =>
											void run(async () => {
												await productApi.request(
													`/assemblies/${selected.id}/join`,
													{ method: "POST" },
												);
												await open(selected);
												await load();
												await refresh();
											})
										}
									/>
								) : null}
								{!selected.can_manage &&
								selected.member_state !== "not_member" ? (
									<Action
										disabled={busy}
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
												await load();
												await refresh();
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
												disabled={busy || !name.trim()}
												onPress={() =>
													void run(async () => {
														await productApi.request(
															`/assemblies/${selected.id}`,
															{
																method: "PATCH",
																body: {
																	name: name.trim(),
																	meeting_url: meeting.trim(),
																},
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
							<View
								style={{
									flexDirection: rtl ? "row-reverse" : "row",
									flexWrap: "wrap",
									gap: 8,
								}}
							>
								{(["in_person", "online"] as const).map((value) => (
									<Pressable
										key={value}
										accessibilityRole="tab"
										accessibilityState={{ selected: kind === value }}
										disabled={busy}
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
											<View
												style={{
													flexDirection: rtl ? "row-reverse" : "row",
													flexWrap: "wrap",
													gap: 8,
												}}
											>
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
							{kind === "online" ? (
								<Action
									label="Refresh assemblies"
									disabled={busy || searching}
									onPress={() => void load()}
								/>
							) : null}
							{account.profile.experience === "starting" ? (
								<Copy>
									You can explore assemblies. Joining requires the Experienced
									path.
								</Copy>
							) : null}
							{kind === "in_person" && !hasAssemblyLocation(account.profile) ? (
								<Copy>Select your city to search nearby assemblies.</Copy>
							) : null}
							<View>
								{assemblies.map((assembly) => (
									<Pressable
										key={assembly.id}
										accessibilityRole="button"
										accessibilityLabel={assembly.name}
										onPress={() => void run(() => open(assembly))}
										style={{
											flexDirection: rtl ? "row-reverse" : "row",
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
							{searched && !assemblies.length ? (
								<Copy>No assemblies found for this search.</Copy>
							) : null}
							{people.map((person) => (
								<Card key={person.id}>
									<Copy>
										{person.name} · {person.area}
									</Copy>
									{person.contact_url ? (
										<Action
											label="Contact on Telegram"
											disabled={busy}
											onPress={() =>
												void run(() => Linking.openURL(person.contact_url!))
											}
										/>
									) : null}
								</Card>
							))}
							{canCreateAssembly(account) ? (
								<Card>
									<Copy>Create your Qahal</Copy>
									<Field
										label="Name"
										value={creationName}
										onChange={setCreationName}
									/>
									<Copy>
										{account.profile.city || "Select your city in onboarding."}
									</Copy>
									<Action
										label={
											kind === "online"
												? "Create online assembly"
												: "Create local assembly"
										}
										disabled={busy || !creationName.trim()}
										onPress={() =>
											void run(async () => {
												const created = await productApi.request<Assembly>(
													"/assemblies",
													{
														method: "POST",
														body: { name: creationName.trim(), kind },
													},
												);
												setCreationName("");
												await refresh();
												await load();
												await open(created);
											})
										}
									/>
								</Card>
							) : account.profile.experience === "leader" &&
								!account.leader_verified ? (
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
										disabled={busy}
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
											disabled={busy}
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
							disabled={busy}
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
					<Card>
						<Copy>
							Share your Telegram contact with nearby people and your assembly
							leader.
						</Copy>
						<Switch
							accessibilityLabel="Share my Telegram contact"
							disabled={busy || !account.providers.includes("telegram")}
							value={account.contact_visible}
							onValueChange={(contact_visible) =>
								void run(async () => {
									await productApi.request("/account", {
										method: "PATCH",
										body: { contact_visible },
									});
									await refresh();
								})
							}
						/>
						{!account.providers.includes("telegram") ? (
							<Copy>
								Link Telegram in your account before sharing your contact.
							</Copy>
						) : null}
					</Card>
					<Action
						label="Endorsements"
						disabled={busy}
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
											disabled={busy}
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
							disabled={busy}
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
						disabled={busy}
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
