import { createAssembliesClient } from "@davar/shared/assembliesClient";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, Switch, Text, View } from "react-native";
import { DiscoveryResults } from "./DiscoveryResults";
import { AssemblyManagement } from "./AssemblyManagement";
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
	AssemblyPerson,
	AssemblyLeader,
	Endorsement,
	AccountNotification,
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

const assembliesApi = createAssembliesClient(productApi);

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
	const [people, setPeople] = useState<AssemblyPerson[]>([]);
	const [selected, setSelected] = useState<Assembly | null>(null);
	const [members, setMembers] = useState<MembershipRequest[]>([]);
	const [tab, setTab] = useState<"qahal" | "people" | "requests">("qahal");
	const [name, setName] = useState("");
	const [meeting, setMeeting] = useState("");
	const [endorser, setEndorser] = useState("");
	const [leaders, setLeaders] = useState<AssemblyLeader[]>([]);
	const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
	const [notifications, setNotifications] = useState<AccountNotification[]>([]);
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
			const result = await assembliesApi.search(
				{
					kind,
					radius,
					latitude: searchLatitude,
					longitude: searchLongitude,
					city: searchCity || "",
				},
				true,
			);
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
	}, [kind, radius, searchCity, searchLatitude, searchLongitude]);
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
			setMembers(await assembliesApi.members(detail.id));
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
								<AssemblyManagement
									selected={selected}
									members={members}
									tab={tab}
									setTab={setTab}
									name={name}
									setName={setName}
									meeting={meeting}
									setMeeting={setMeeting}
									busy={busy}
									onSave={(name, meeting) =>
										void run(async () => {
											await productApi.request(`/assemblies/${selected.id}`, {
												method: "PATCH",
												body: { name, meeting_url: meeting },
											});
											await open(selected);
										})
									}
									onDecide={(id, decision) =>
										void run(async () => {
											await productApi.request(
												`/assemblies/${selected.id}/memberships/${id}/decision`,
												{ method: "POST", body: { decision } },
											);
											await open(selected);
										})
									}
								/>
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
							<DiscoveryResults
								assemblies={assemblies}
								people={people}
								searched={searched}
								busy={busy}
								onOpen={(assembly) => void run(() => open(assembly))}
								onContact={(url) => void run(() => Linking.openURL(url))}
							/>
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
