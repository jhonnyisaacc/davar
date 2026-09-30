import { useState, type ReactNode } from "react";
import type {
	Account,
	Assembly,
	MembershipRequest,
} from "@davar/shared/productContracts";
import { QAHAL_QUESTIONS } from "@davar/shared/qahalQuestions";
import { productApi } from "../services/productApi";
import { CityChooser } from "./CityChooser";
import { Users, ChevronRight } from "lucide-react";

type Endorsement = {
	id: string;
	state: string;
	applicant_name: string;
	leader_name: string;
	can_decide: boolean;
};
export function AssembliesWorkspace({
	account,
	onAccount,
}: {
	account: Account;
	onAccount: (a: Account) => void;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [code, setCode] = useState("");
	const [name, setName] = useState(
		account.display_name === "Reader" ? "" : account.display_name,
	);
	const [kind, setKind] = useState<"in_person" | "online">(
		account.profile.city ? "in_person" : "online",
	);
	const [radius, setRadius] = useState("25");
	const [assemblies, setAssemblies] = useState<Assembly[]>([]);
	const [people, setPeople] = useState<
		{ id: string; name: string; area: string; contact_url?: string }[]
	>([]);
	const [managed, setManaged] = useState<Assembly | null>(null);
	const [members, setMembers] = useState<MembershipRequest[]>([]);
	const [assemblyName, setAssemblyName] = useState("");
	const [meeting, setMeeting] = useState("");
	const [leaders, setLeaders] = useState<
		{ id: string; name: string; city: string }[]
	>([]);
	const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
	const [notifications, setNotifications] = useState<
		{ id: string; kind: string }[]
	>([]);
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
	async function search() {
		const query = new URLSearchParams({
			kind,
			radius_km: radius,
			latitude: String(account.profile.latitude ?? ""),
			longitude: String(account.profile.longitude ?? ""),
		});
		const result = await productApi.request<{
			assemblies: Assembly[];
			people: typeof people;
		}>(`/assemblies?${query}`);
		setAssemblies(result.assemblies);
		setPeople(result.people);
	}
	async function manage(assembly: Assembly) {
		setManaged(assembly);
		setAssemblyName(assembly.name);
		setMeeting(assembly.meeting_url || "");
		setMembers(
			(
				await productApi.request<{ memberships: MembershipRequest[] }>(
					`/assemblies/${assembly.id}/members`,
				)
			).memberships,
		);
	}
	const profile = account.profile;
	const keys =
		profile.experience === "starting"
			? ["1", "3"]
			: ["1", "2", "3", "4", "5", "6", "7"];
	const next = keys.find((k) => profile.answers?.[k] === undefined);
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
	let body: ReactNode = null;
	if (!account.providers.length)
		body = <p>Sign in below to join Assemblies.</p>;
	else if (!account.admitted)
		body = (
			<>
				<h2 className="text-[34px] text-center font-semibold">Welcome</h2>
				<p>Enter the invitation code from your leader.</p>
				<label>
					Invitation code
					<input
						value={code}
						onChange={(e) => setCode(e.target.value)}
						className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
					/>
				</label>
				{button("Continue", async () =>
					onAccount(
						await productApi.request<Account>("/account/admission", {
							method: "POST",
							body: { code },
						}),
					),
				)}
			</>
		);
	else if (!profile.experience)
		body = (
			<>
				<h2 className="text-[34px] text-center font-semibold">Your path</h2>
				{(["starting", "experienced", "leader"] as const).map((experience) => (
					<div key={experience}>
						{button(
							experience === "starting"
								? "Starting"
								: experience === "leader"
									? "Leader"
									: "Experienced",
							() => save({ profile: { experience } }),
						)}
					</div>
				))}
			</>
		);
	else if (next)
		body = (
			<>
				<h2 className="text-[28px] font-semibold text-center">
					{QAHAL_QUESTIONS[Number(next) - 1]}
				</h2>
				<p>
					Question {keys.indexOf(next) + 1} of {keys.length} · Progress saved
				</p>
				{button("Yes", () =>
					save({ profile: { answers: { ...profile.answers, [next]: true } } }),
				)}
				{button("No", () =>
					save({ profile: { answers: { ...profile.answers, [next]: false } } }),
				)}
			</>
		);
	else if (!profile.gender)
		body = (
			<>
				<h2 className="text-[34px] text-center font-semibold">Your name</h2>
				<label>
					Your name
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
					/>
				</label>
				{button(
					"Male",
					() => save({ display_name: name, profile: { gender: "male" } }),
					!name.trim(),
				)}
				{button(
					"Female",
					() => save({ display_name: name, profile: { gender: "female" } }),
					!name.trim() || profile.experience === "leader",
				)}
			</>
		);
	else if (!profile.city)
		body = (
			<>
				<p>Choose your city. Discovery uses an approximate area.</p>
				{city}
			</>
		);
	else if (!account.onboarding_complete)
		body = (
			<>
				<h2 className="text-[34px] text-center font-semibold">
					Hidden by default
				</h2>
				<label>
					<input
						type="checkbox"
						checked={account.discoverable}
						onChange={(e) =>
							void run(() => save({ discoverable: e.target.checked }))
						}
					/>{" "}
					Share my name and city with nearby believers
				</label>
				{button("Continue", () =>
					save({ profile: { visibility_reviewed: true } }),
				)}
			</>
		);
	else
		body = (
			<>
				<div className="flex gap-3 justify-center">
					<button
						type="button"
						onClick={() => setKind("in_person")}
						className={`rounded-full px-5 py-2 ${kind === "in_person" ? "bg-[var(--accent-glow)]" : ""}`}
					>
						Local
					</button>
					<button
						type="button"
						onClick={() => setKind("online")}
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
					kind === "in_person" && profile.latitude === undefined,
				)}
				{assemblies.map((assembly) => (
					<section
						key={assembly.id}
						className="py-5 border-b border-[var(--neomorph-border)] space-y-3"
					>
						<div className="flex items-center gap-4">
							<Users size={28} />
							<div className="flex-1">
								<h2 className="text-[22px]">{assembly.name}</h2>
								<p className="text-sm">
									{assembly.city || "Online"} · {assembly.member_state}
									{assembly.distance_km !== null
										? ` · ${assembly.distance_km} km`
										: ""}
								</p>
							</div>
							<ChevronRight size={18} />
						</div>
						{assembly.meeting_url ? (
							<a href={assembly.meeting_url} target="_blank" rel="noreferrer">
								Meeting link
							</a>
						) : null}
						{assembly.member_state === "not_member"
							? button("Request to join", async () => {
									await productApi.request(`/assemblies/${assembly.id}/join`, {
										method: "POST",
									});
									await search();
								})
							: !assembly.can_manage
								? button(
										assembly.member_state === "requested"
											? "Cancel request"
											: "Leave assembly",
										async () => {
											await productApi.request(
												`/assemblies/${assembly.id}/leave`,
												{ method: "DELETE" },
											);
											await search();
										},
									)
								: null}
						{assembly.can_manage
							? button("Manage", () => manage(assembly))
							: null}
					</section>
				))}
				{people.map((person) => (
					<div key={person.id}>
						<p>
							{person.name} · {person.area}
						</p>
						{person.contact_url ? (
							<a href={person.contact_url}>Contact</a>
						) : null}
					</div>
				))}
				{managed ? (
					<section className="space-y-3">
						<h2>Manage {managed.name}</h2>
						<label>
							Assembly name
							<input
								value={assemblyName}
								onChange={(e) => setAssemblyName(e.target.value)}
								className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
							/>
						</label>
						<label>
							Meeting link
							<input
								value={meeting}
								onChange={(e) => setMeeting(e.target.value)}
								className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
							/>
						</label>
						{button("Save", async () => {
							await productApi.request(`/assemblies/${managed.id}`, {
								method: "PATCH",
								body: { name: assemblyName, meeting_url: meeting },
							});
							await search();
						})}
						{members.map((member) => (
							<div key={member.id} className="space-y-2">
								<p>
									{member.user.name} · {member.state}
									{member.user.age ? ` · ${member.user.age}` : ""}{" "}
									{member.user.gender || ""}
								</p>
								{member.user.contact_url ? (
									<a href={member.user.contact_url}>Contact for admission</a>
								) : null}
								{member.state === "requested"
									? ["accepted", "declined"].map((decision) => (
											<span key={decision}>
												{button(decision, async () => {
													await productApi.request(
														`/assemblies/${managed.id}/memberships/${member.id}/decision`,
														{ method: "POST", body: { decision } },
													);
													await manage(managed);
												})}
											</span>
										))
									: null}
							</div>
						))}
					</section>
				) : null}
				{account.leader_verified ? (
					<details>
						<summary>Create an assembly</summary>
						<label>
							Name
							<input
								value={assemblyName}
								onChange={(e) => setAssemblyName(e.target.value)}
								className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
							/>
						</label>
						<label>
							Meeting link
							<input
								value={meeting}
								onChange={(e) => setMeeting(e.target.value)}
								className="block p-3 rounded-xl bg-[var(--neomorph-bg)]"
							/>
						</label>
						{button(
							"Create",
							async () => {
								await productApi.request("/assemblies", {
									method: "POST",
									body: { name: assemblyName, kind, meeting_url: meeting },
								});
								await search();
							},
							!assemblyName.trim(),
						)}
					</details>
				) : null}
				{profile.experience === "leader" ? (
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
										{button(state, async () => {
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
										})}
									</span>
								))
							: null}
					</div>
				))}
				<label className="block">
					<input
						type="checkbox"
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
						disabled={!account.providers.includes("telegram")}
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
		<div className="space-y-5">
			{error ? <p role="status">{error}</p> : null}
			{body}
		</div>
	);
}
