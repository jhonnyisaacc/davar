import { CityPicker } from "./CityPicker";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { productApi, useSession } from "../account/session";
import { Action, Copy, Field, useProductStyle } from "../product/ui";
import { QAHAL_QUESTIONS } from "@davar/shared/qahalQuestions";
export function Onboarding() {
	const account = useSession((s) => s.account)!;
	const refresh = useSession((s) => s.refresh);
	const { colors, rtl } = useProductStyle();
	const [name, setName] = useState(
		account.display_name === "Reader" ? "" : account.display_name,
	);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const profile = account.profile;
	const questions =
		profile.experience === "starting"
			? ["1", "3"]
			: ["1", "2", "3", "4", "5", "6", "7"];
	const next = questions.find((key) => profile.answers?.[key] === undefined);
	async function save(body: unknown) {
		setBusy(true);
		setError("");
		try {
			await productApi.request("/account", { method: "PATCH", body });
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}
	const title = !profile.experience
		? "Your path"
		: next
			? QAHAL_QUESTIONS[Number(next) - 1]
			: !profile.gender
				? "Your name"
				: !profile.city
					? "Your city"
					: "Hidden by default";
	function choice(
		label: string,
		description: string,
		action: () => void,
		disabled = false,
	) {
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				disabled={busy || disabled}
				onPress={action}
				style={{
					padding: 18,
					borderRadius: 16,
					borderWidth: 1,
					borderColor: colors.border,
					backgroundColor: colors.surface,
					flexDirection: rtl ? "row-reverse" : "row",
					gap: 12,
					alignItems: "center",
					opacity: disabled || busy ? 0.5 : 1,
				}}
			>
				<View style={{ flex: 1, gap: 4 }}>
					<Text
						style={{
							fontFamily: "Inter_600SemiBold",
							fontSize: 14,
							color: colors.textPrimary,
							textAlign: rtl ? "right" : "left",
							writingDirection: rtl ? "rtl" : "ltr",
						}}
					>
						{label}
					</Text>
					<Text
						style={{
							fontFamily: "Inter_400Regular",
							fontSize: 12,
							color: colors.textSecondary,
						}}
					>
						{description}
					</Text>
				</View>
				<ChevronRight size={18} color={colors.textSecondary} />
			</Pressable>
		);
	}
	return (
		<View style={{ gap: 18, paddingTop: 28 }}>
			<Text
				accessibilityRole="header"
				style={{
					fontFamily: "Manrope_600SemiBold",
					fontSize: 34,
					lineHeight: 38,
					color: colors.textPrimary,
					textAlign: "center",
				}}
			>
				{title}
			</Text>
			{error ? <Copy>{error}</Copy> : null}
			{!profile.experience ? (
				<>
					<Copy>Choose the path that reflects where you are today.</Copy>
					{choice(
						"Starting",
						"I am beginning to learn",
						() => void save({ profile: { experience: "starting" } }),
					)}
					{choice(
						"Experienced",
						"I confess this faith",
						() => void save({ profile: { experience: "experienced" } }),
					)}
					{choice(
						"Leader",
						"I lead an assembly",
						() => void save({ profile: { experience: "leader" } }),
					)}
				</>
			) : next ? (
				<>
					<Text
						style={{
							fontFamily: "Inter_400Regular",
							fontSize: 12,
							color: colors.textSecondary,
							textAlign: "center",
						}}
					>
						Question {questions.indexOf(next) + 1} of {questions.length} ·
						Progress saved
					</Text>
					{choice(
						"Yes",
						"I confess this faith",
						() =>
							void save({
								profile: { answers: { ...profile.answers, [next]: true } },
							}),
					)}
					{choice(
						"No",
						"I’m not ready to affirm this",
						() =>
							void save({
								profile: { answers: { ...profile.answers, [next]: false } },
							}),
					)}
				</>
			) : !profile.gender ? (
				<>
					<Field label="Your name" value={name} onChange={setName} />
					<Copy>
						Gender is used only when an assembly applies a gender-specific
						leadership role.
					</Copy>
					{choice(
						"Male",
						"",
						() =>
							void save({ display_name: name, profile: { gender: "male" } }),
						!name.trim(),
					)}
					{choice(
						"Female",
						"",
						() =>
							void save({ display_name: name, profile: { gender: "female" } }),
						!name.trim() || profile.experience === "leader",
					)}
				</>
			) : !profile.city ? (
				<>
					<Copy>
						Choose your city. Only an approximate area is used for discovery.
					</Copy>
					<CityPicker />
				</>
			) : (
				<>
					<Copy>Choose when nearby people can find you.</Copy>
					<View
						style={{
							flexDirection: rtl ? "row-reverse" : "row",
							alignItems: "center",
							gap: 12,
						}}
					>
						<View style={{ flex: 1 }}>
							<Copy>Visible nearby</Copy>
							<Text style={{ fontSize: 12, color: colors.textSecondary }}>
								Share your name and city with nearby believers.
							</Text>
						</View>
						<Switch
							accessibilityLabel="Visible nearby"
							disabled={busy}
							value={account.discoverable}
							onValueChange={(value) => void save({ discoverable: value })}
						/>
					</View>
					<Copy>
						Contact details remain hidden unless you separately opt in.
					</Copy>
					<Action
						label="Continue to Assemblies"
						disabled={busy}
						onPress={() =>
							void save({ profile: { visibility_reviewed: true } })
						}
					/>
				</>
			)}
		</View>
	);
}
