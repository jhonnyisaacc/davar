import { DiscoveryResults } from "./DiscoveryResults";
import { AssemblyManagement } from "./AssemblyManagement";
import { AssemblyOnboarding } from "./Onboarding";
import { createAssembliesClient } from "@davar/shared/assembliesClient";
import type {
	Account,
	Assembly,
	MembershipRequest,
	AssemblyPerson,
	AssemblyLeader,
	Endorsement,
	AccountNotification,
} from "@davar/shared/productContracts";
import {
	assembliesErrorMessage,
	canCreateAssembly,
	hasAssemblyLocation,
} from "@davar/shared/assembliesPresentation";
import { qahalOnboardingStep } from "@davar/shared/qahalQuestions";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { productApi } from "../../services/productApi";
import { CityChooser } from "../../components/CityChooser";

const assembliesApi = createAssembliesClient(productApi);

export function AssembliesWorkspace({
	account,
	onAccount,
}: {
	account: Account;
	onAccount: (a: Account) => void;
}) {
	const searchVersion = useRef(0);
	const actionPending = useRef(false);
	const [searched, setSearched] = useState(false);
	const [searching, setSearching] = useState(false);
	const [creationName, setCreationName] = useState("");
	const [creationMeeting, setCreationMeeting] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [kind, setKind] = useState<"in_person" | "online">(
		account.profile.city ? "in_person" : "online",
	);
	const [radius, setRadius] = useState("25");
	const [assemblies, setAssemblies] = useState<Assembly[]>([]);
	const [people, setPeople] = useState<AssemblyPerson[]>([]);
	const [managed, setManaged] = useState<Assembly | null>(null);
	const [members, setMembers] = useState<MembershipRequest[]>([]);
	const [assemblyName, setAssemblyName] = useState("");
	const [meeting, setMeeting] = useState("");
	const [leaders, setLeaders] = useState<AssemblyLeader[]>([]);
	const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
	const [notifications, setNotifications] = useState<AccountNotification[]>([]);
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
	const button = (
		label: string,
		action: () => Promise<void>,
		disabled = false,
	) => (
		<button
			type="button"
			disabled={busy || disabled}
			onClick={() => void run(action)}
			className="rounded-2xl px-5 py-3 border border-[var(--neomorph-border)] bg-[var(--neomorph-bg)] disabled:opacity-50"
		>
			{label}
		</button>
	);
	async function save(body: unknown) {
		onAccount(
			await productApi.request<Account>("/account", { method: "PATCH", body }),
		);
	}
	const search = useCallback(async () => {
		const version = ++searchVersion.current;
		setSearching(true);
		setSearched(false);
		setAssemblies([]);
		setPeople([]);
		setError("");
		try {
			const result = await assembliesApi.search({
				kind,
				radius,
				latitude: account.profile.latitude,
				longitude: account.profile.longitude,
			});
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
	}, [kind, radius, account.profile.latitude, account.profile.longitude]);
	const hasLocation = hasAssemblyLocation(account.profile);
	useEffect(() => {
		if (account.onboarding_complete && (kind === "online" || hasLocation))
			void search();
		return () => {
			searchVersion.current++;
		};
	}, [account.onboarding_complete, kind, hasLocation, search]);
	async function manage(assembly: Assembly) {
		const result = await assembliesApi.members(assembly.id);
		setManaged(assembly);
		setAssemblyName(assembly.name);
		setMeeting(assembly.meeting_url || "");
		setMembers(result);
	}
	const profile = account.profile;
	const city = (
		<CityChooser
			authenticated
			onChoose={async (city) => {
				await productApi.request("/account/city", {
					method: "PATCH",
					body: { selection: city.selection },
				});
				onAccount(await productApi.request<Account>("/account"));
			}}
		/>
	);
	const onboardingStep = qahalOnboardingStep(account);
	let body: ReactNode = null;
	if (onboardingStep)
		body = (
			<AssemblyOnboarding
				step={onboardingStep}
				account={account}
				busy={busy}
				run={run}
				save={save}
				city={city}
				button={button}
			/>
		);
	else
		body = (
			<>
				<div className="flex gap-3 justify-center">
					<button
						type="button"
						aria-pressed={kind === "in_person"}
						disabled={busy}
						onClick={() => {
							setKind("in_person");
							setManaged(null);
						}}
						className={`rounded-full px-5 py-2 ${kind === "in_person" ? "bg-[var(--accent-glow)]" : ""}`}
					>
						Local
					</button>
					<button
						type="button"
						aria-pressed={kind === "online"}
						disabled={busy}
						onClick={() => {
							setKind("online");
							setManaged(null);
						}}
						className={`rounded-full px-5 py-2 ${kind === "online" ? "bg-[var(--accent-glow)]" : ""}`}
					>
						Online
					</button>
				</div>
				{kind === "in_person" ? (
					<>
						<p>{profile.city} · approximate area</p>
						<details>
							<summary>Change city</summary>
							{city}
						</details>
						<label>
							Radius
							<select
								value={radius}
								onChange={(e) => setRadius(e.target.value)}
							>
								{[10, 25, 50, 100].map((r) => (
									<option key={r} value={r}>
										{r} km
									</option>
								))}
							</select>
						</label>
					</>
				) : null}
				{button(
					"Find assemblies",
					search,
					searching || (kind === "in_person" && !hasAssemblyLocation(profile)),
				)}
				{searching ? <p role="status">Loading assemblies…</p> : null}
				{searched && !assemblies.length ? (
					<p role="status">No assemblies found for this search.</p>
				) : null}
				{kind === "in_person" && !hasAssemblyLocation(profile) ? (
					<p>Select your city to search nearby assemblies.</p>
				) : null}
				{profile.experience === "starting" ? (
					<p>
						You can explore assemblies. Joining requires the Experienced path.
					</p>
				) : null}
				<DiscoveryResults
					account={account}
					assemblies={assemblies}
					people={people}
					button={button}
					onManage={manage}
					onJoin={async (assembly) => {
						await productApi.request(`/assemblies/${assembly.id}/join`, {
							method: "POST",
						});
						await search();
						onAccount(await productApi.request<Account>("/account"));
					}}
					onLeave={async (assembly) => {
						await productApi.request(`/assemblies/${assembly.id}/leave`, {
							method: "DELETE",
						});
						await search();
						onAccount(await productApi.request<Account>("/account"));
					}}
				/>
				{managed ? (
					<AssemblyManagement
						managed={managed}
						members={members}
						assemblyName={assemblyName}
						setAssemblyName={setAssemblyName}
						meeting={meeting}
						setMeeting={setMeeting}
						button={button}
						onSave={async (name, meeting_url) => {
							const updated = await productApi.request<Assembly>(
								`/assemblies/${managed.id}`,
								{ method: "PATCH", body: { name, meeting_url } },
							);
							setManaged(updated);
							await search();
						}}
						onDecide={async (memberId, decision) => {
							await productApi.request(
								`/assemblies/${managed.id}/memberships/${memberId}/decision`,
								{ method: "POST", body: { decision } },
							);
							await manage(managed);
							await search();
						}}
					/>
				) : null}
				{canCreateAssembly(account) ? (
					<details>
						<summary>Create an assembly</summary>
						<label>
							Name
							<input
								value={creationName}
								onChange={(e) => setCreationName(e.target.value)}
								className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
							/>
						</label>
						<label>
							Meeting link
							<input
								value={creationMeeting}
								onChange={(e) => setCreationMeeting(e.target.value)}
								className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
							/>
						</label>
						{button(
							"Create",
							async () => {
								await productApi.request("/assemblies", {
									method: "POST",
									body: {
										name: creationName.trim(),
										kind,
										meeting_url: creationMeeting.trim(),
									},
								});
								setCreationName("");
								setCreationMeeting("");
								onAccount(await productApi.request<Account>("/account"));
								await search();
							},
							!creationName.trim(),
						)}
					</details>
				) : null}
				{profile.experience === "leader" && !account.leader_verified ? (
					<details>
						<summary>Leader verification</summary>
						<p>
							Two verified leaders must independently endorse you. A decline
							requires support.
						</p>
						{button("Find verified leaders", async () =>
							setLeaders(
								(
									await productApi.request<{ leaders: typeof leaders }>(
										"/assemblies/leaders",
									)
								).leaders,
							),
						)}
						{leaders.map((leader) => (
							<div key={leader.id}>
								{button(`${leader.name} · ${leader.city || ""}`, async () => {
									await productApi.request("/endorsements", {
										method: "POST",
										body: { leader_id: leader.id },
									});
									setLeaders((rows) =>
										rows.filter((row) => row.id !== leader.id),
									);
								})}
							</div>
						))}
					</details>
				) : null}
				{button("Endorsement requests", async () =>
					setEndorsements(
						(
							await productApi.request<{ endorsements: Endorsement[] }>(
								"/endorsements",
							)
						).endorsements,
					),
				)}
				{endorsements.map((item) => (
					<div key={item.id}>
						<p>
							{item.applicant_name} · {item.leader_name} · {item.state}
						</p>
						{item.can_decide
							? ["accepted", "declined"].map((state) => (
									<span key={state}>
										{button(
											state === "accepted"
												? "Accept endorsement"
												: "Decline endorsement",
											async () => {
												await productApi.request(`/endorsements/${item.id}`, {
													method: "PATCH",
													body: { state },
												});
												setEndorsements(
													(
														await productApi.request<{
															endorsements: Endorsement[];
														}>("/endorsements")
													).endorsements,
												);
												onAccount(
													await productApi.request<Account>("/account"),
												);
											},
										)}
									</span>
								))
							: null}
					</div>
				))}
				<label className="block">
					<input
						type="checkbox"
						disabled={busy}
						checked={account.discoverable}
						onChange={(e) =>
							void run(() => save({ discoverable: e.target.checked }))
						}
					/>{" "}
					Visible nearby: name and city
				</label>
				<label className="block">
					<input
						type="checkbox"
						checked={account.contact_visible}
						disabled={busy || !account.providers.includes("telegram")}
						onChange={(e) =>
							void run(() => save({ contact_visible: e.target.checked }))
						}
					/>{" "}
					Share my Telegram contact
				</label>
				{button("Notifications", async () =>
					setNotifications(
						(
							await productApi.request<{ notifications: typeof notifications }>(
								"/account/notifications",
							)
						).notifications,
					),
				)}
				{notifications.map((n) => (
					<p key={n.id}>{n.kind.replaceAll("_", " ")}</p>
				))}
			</>
		);
	return (
		<div className="space-y-5" aria-busy={busy || searching}>
			{error ? <p role="alert">{error}</p> : null}
			{body}
		</div>
	);
}
