import { useState, type ReactNode } from "react";
import type { Account } from "@davar/shared/productContracts";
import {
	qahalQuestionIds,
	QAHAL_QUESTIONS,
} from "@davar/shared/qahalQuestions";
import type { AssemblyButton } from "./types";
export function AssemblyOnboarding({
	account,
	busy,
	run,
	save,
	city,
	button,
}: {
	account: Account;
	busy: boolean;
	city: ReactNode;
	button: AssemblyButton;
	run: (action: () => Promise<void>) => Promise<void>;
	save: (body: unknown) => Promise<void>;
}) {
	const profile = account.profile;
	const [name, setName] = useState(
		account.display_name === "Reader" ? "" : account.display_name,
	);
	const keys = qahalQuestionIds(profile.experience);
	const next = keys.find((key) => profile.answers?.[key] === undefined);
	let body: ReactNode = null;
	if (!profile.experience)
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
						disabled={busy}
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

	return body;
}
