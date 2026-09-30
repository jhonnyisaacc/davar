import { useState } from "react";
import { productApi, useSession } from "./session";
import { SignIn } from "./SignIn";
import { Action, Card, Copy } from "../product/ui";
import { useAppStore } from "@/src/store/useAppStore";
const keys = [
	"themeMode",
	"language",
	"hebrewFontScale",
	"besorahTextVersion",
	"besorahLanguage",
	"showQumran",
	"showFullChapter",
	"seferMode",
	"hebrewOnly",
	"translationOnly",
	"showCantillation",
	"showNikud",
] as const;
export function AccountControls() {
	const account = useSession((s) => s.account);
	const refresh = useSession((s) => s.refresh);
	const logout = useSession((s) => s.logout);
	const [error, setError] = useState("");
	const [linking, setLinking] = useState(false);
	async function run(action: () => Promise<void>) {
		try {
			setError("");
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		}
	}
	if (!account || !account.providers.length) return <SignIn link={!!account} />;
	return (
		<Card>
			<Copy>{account.display_name}</Copy>
			<Copy>Sign-in methods: {account.providers.join(", ")}</Copy>
			{error ? <Copy>{error}</Copy> : null}
			<Action
				label="Save reading settings to account"
				onPress={() =>
					void run(async () => {
						const state = useAppStore.getState();
						const settings = Object.fromEntries(
							keys.map((key) => [key, state[key]]),
						);
						await productApi.request("/account/settings", {
							method: "PATCH",
							body: { settings, version: account.settings_version },
						});
						await refresh();
					})
				}
			/>
			<Action
				label="Load reading settings from account"
				onPress={() =>
					void run(async () => {
						await refresh();
						const settings = useSession.getState().account!.settings;
						const safe = Object.fromEntries(
							keys
								.filter((key) => settings[key] !== undefined)
								.map((key) => [key, settings[key]]),
						);
						useAppStore.setState(safe);
						const state = useAppStore.getState();
						if (state.hebrewOnly) state.setHebrewOnly(true);
						else if (state.translationOnly) state.setTranslationOnly(true);
						state.setSeferMode(state.seferMode);
					})
				}
			/>
			<Action
				label="Link sign-in method"
				onPress={() => setLinking(!linking)}
			/>
			{linking ? <SignIn link /> : null}
			<Action label="Sign out" onPress={() => void run(logout)} />
		</Card>
	);
}
