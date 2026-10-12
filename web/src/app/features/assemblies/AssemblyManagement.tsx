import type {
	Assembly,
	MembershipRequest,
} from "@davar/shared/productContracts";
import type { AssemblyButton } from "./types";
export function AssemblyManagement({
	managed,
	members,
	assemblyName,
	setAssemblyName,
	meeting,
	setMeeting,
	button,
	onSave,
	onDecide,
}: {
	managed: Assembly;
	members: MembershipRequest[];
	assemblyName: string;
	setAssemblyName: (value: string) => void;
	meeting: string;
	setMeeting: (value: string) => void;
	button: AssemblyButton;
	onSave: (name: string, meeting: string) => Promise<void>;
	onDecide: (memberId: string, decision: string) => Promise<void>;
}) {
	return (
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
			{button(
				"Save",
				() => onSave(assemblyName.trim(), meeting.trim()),
				!assemblyName.trim(),
			)}
			{members.map((member) => (
				<div key={member.id} className="space-y-2">
					<p>
						{member.user.name} ·{" "}
						{member.state === "requested" ? "Request pending" : "Member"}
						{member.user.age ? ` · ${member.user.age}` : ""}{" "}
						{member.user.gender || ""}
					</p>
					{member.user.contact_url ? (
						<a href={member.user.contact_url}>Contact for admission</a>
					) : null}
					{member.state === "requested"
						? ["accepted", "declined"].map((decision) => (
								<span key={decision}>
									{button(decision === "accepted" ? "Accept" : "Decline", () =>
										onDecide(member.id, decision),
									)}
								</span>
							))
						: null}
				</div>
			))}
		</section>
	);
}
