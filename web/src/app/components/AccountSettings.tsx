import { useState } from "react";
import type { Account } from "@davar/shared/productContracts";
import type { SettingsScreenProps } from "./SettingsScreen";
import { productApi } from "../services/productApi";
export function AccountSettings(props: SettingsScreenProps) {
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	async function sync(load: boolean) {
		setBusy(true);
		setStatus("");
		try {
			const account = await productApi.request<Account>("/account");
			if (load) {
				const s = account.settings;
				if (s.themeMode === "light" || s.themeMode === "dark")
					props.onThemeChange(s.themeMode);
				if (s.language === "en" || s.language === "es" || s.language === "he")
					props.onLanguageChange(s.language);
				if (
					s.besorahTextVersion === "hutter" ||
					s.besorahTextVersion === "delitzsch"
				)
					props.onBesorahTextVersionChange(s.besorahTextVersion);
				if (
					(s.besorahLanguage === "hebrew" || s.besorahLanguage === "greek") &&
					(s.besorahLanguage !== "greek" || props.greekAvailable)
				)
					props.onBesorahLanguageChange(s.besorahLanguage);
				if (typeof s.showFullChapter === "boolean")
					props.onFullChapterChange(s.showFullChapter);
				if (typeof s.hebrewOnly === "boolean")
					props.onHebrewOnlyChange(s.hebrewOnly);
				if (typeof s.showQumran === "boolean")
					props.onQumranChange(s.showQumran);
				if (typeof s.seferMode === "boolean")
					props.onSeferModeChange(s.seferMode);
			} else {
				await productApi.request("/account/settings", {
					method: "PATCH",
					body: {
						version: account.settings_version,
						settings: {
							themeMode: props.theme,
							language: props.language,
							besorahLanguage: props.besorahLanguage,
							besorahTextVersion: props.besorahTextVersion,
							showFullChapter: props.showFullChapter,
							hebrewOnly: props.hebrewOnly,
							seferMode: props.seferMode,
							showQumran: props.showQumran,
						},
					},
				});
			}
			setStatus(load ? "Account settings loaded." : "Reading settings saved.");
		} catch (e) {
			setStatus(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="max-w-2xl mx-auto px-6 pb-12 space-y-3">
			<h2>Account settings</h2>
			{productApi.authenticated() ? (
				<>
					<button
						type="button"
						disabled={busy}
						onClick={() => void sync(false)}
						className="rounded-full px-5 py-3 border border-[var(--neomorph-border)]"
					>
						Save reading settings
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => void sync(true)}
						className="rounded-full px-5 py-3 border border-[var(--neomorph-border)]"
					>
						Load account settings
					</button>
				</>
			) : (
				<p>
					Sign in through Assemblies or Commentary to synchronize your settings.
				</p>
			)}
			{status ? <p role="status">{status}</p> : null}
		</section>
	);
}
