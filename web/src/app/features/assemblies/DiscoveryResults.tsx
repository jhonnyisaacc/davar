import { ChevronRight, Users } from "lucide-react";
import {
	assemblyMembershipLabel,
	canRequestAssembly,
} from "@davar/shared/assembliesPresentation";
import type {
	Account,
	Assembly,
	AssemblyPerson,
} from "@davar/shared/productContracts";
import type { AssemblyButton } from "./types";
export function DiscoveryResults({
	account,
	assemblies,
	people,
	button,
	onJoin,
	onLeave,
	onManage,
}: {
	account: Account;
	assemblies: Assembly[];
	people: AssemblyPerson[];
	button: AssemblyButton;
	onJoin: (assembly: Assembly) => Promise<void>;
	onLeave: (assembly: Assembly) => Promise<void>;
	onManage: (assembly: Assembly) => Promise<void>;
}) {
	return (
		<>
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
								{assembly.city || "Online"} ·{" "}
								{assemblyMembershipLabel(assembly.member_state)}
								{assembly.distance_km !== null
									? ` · ${assembly.distance_km} km`
									: ""}
							</p>
						</div>
						<ChevronRight size={18} className="rtl:rotate-180" />
					</div>
					{assembly.meeting_url ? (
						<a href={assembly.meeting_url} target="_blank" rel="noreferrer">
							Meeting link
						</a>
					) : null}
					{canRequestAssembly(account, assembly)
						? button("Request to join", () => onJoin(assembly))
						: !assembly.can_manage && assembly.member_state !== "not_member"
							? button(
									assembly.member_state === "requested"
										? "Cancel request"
										: "Leave assembly",
									() => onLeave(assembly),
								)
							: null}
					{assembly.can_manage
						? button("Manage", () => onManage(assembly))
						: null}
				</section>
			))}
			{people.map((person) => (
				<div key={person.id}>
					<p>
						{person.name} · {person.area}
					</p>
					{person.contact_url ? <a href={person.contact_url}>Contact</a> : null}
				</div>
			))}
		</>
	);
}
