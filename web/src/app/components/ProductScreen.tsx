import { useCallback, useState } from "react";
import type { CommentaryContext } from "@davar/shared/productContracts";
import { webSession } from "../services/productApi";
import { useWebSession } from "../features/account/useWebSession";
import { ProductSignIn } from "../features/account/ProductSignIn";
import { CommentaryScreen } from "../features/commentary/CommentaryScreen";
import { productControls } from "../features/product/controls";
import { AssembliesEntry } from "./AssembliesEntry";
import { AssembliesWorkspace } from "./AssembliesWorkspace";
import { useProductCapabilities } from "../hooks/useProductCapabilities";
import { useTranslation } from "../hooks/useTranslation";
export function ProductScreen({
	screen,
	language,
	context,
}: {
	context?: CommentaryContext | null;
	screen: "commentary" | "assemblies";
	language: "en" | "es" | "he";
}) {
	const { capabilities } = useProductCapabilities();
	const { t } = useTranslation(language);
	const { account, ready: sessionReady, error: sessionError } = useWebSession();
	const setAccount = webSession.setAccount;
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [prompt, setPrompt] = useState("");
	const { button } = productControls(busy);
	const run = useCallback(async (action: () => Promise<void>) => {
		setBusy(true);
		setError("");
		try {
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}, []);
	const signIn = (
		<ProductSignIn
			account={account}
			busy={busy}
			run={run}
			onStatus={setError}
		/>
	);
	if (screen === "assemblies" && !capabilities.flags.assemblies) {
		return (
			<main
				dir={language === "he" ? "rtl" : "ltr"}
				className="max-w-4xl mx-auto px-6 py-12 text-[var(--text-primary)]"
			>
				<h1 className="text-3xl font-semibold">{t("tabs.assemblies")}</h1>
				<p className="mt-4">{t("featureAvailability.assembliesUnavailable")}</p>
			</main>
		);
	}
	const content = (
		<main
			dir={language === "he" ? "rtl" : "ltr"}
			className="max-w-4xl mx-auto px-6 pb-24 space-y-5 text-[var(--text-primary)]"
		>
			<h1 className="text-3xl font-semibold">
				{screen === "commentary" ? "Commentary" : "Assemblies"}
			</h1>
			{screen === "commentary" && context ? (
				<p className="text-sm text-[var(--accent-deep)]">
					{context.reference.book_id} {context.reference.chapter}:
					{context.reference.verse} · {context.edition_id}
					{context.selected_text ? ` · ${context.selected_text}` : ""}
				</p>
			) : null}
			{error || sessionError ? (
				<p role="status">{error || sessionError}</p>
			) : null}
			{screen === "commentary" ? (
				<CommentaryScreen
					language={language}
					account={account}
					context={context}
					busy={busy}
					run={run}
					signIn={signIn}
					prompt={prompt}
					setPrompt={setPrompt}
				/>
			) : null}
			{screen === "assemblies" ? (
				account ? (
					<AssembliesWorkspace
						key={account.id}
						account={account}
						onAccount={setAccount}
					/>
				) : (
					signIn
				)
			) : null}

			{account ? (
				<details>
					<summary>Linked identities</summary>
					<p>{account.providers.join(", ") || "Guest"}</p>
					{signIn}
				</details>
			) : null}
			{account
				? button(
						"Sign out",
						() =>
							void run(async () => {
								try {
									await webSession.logout();
								} finally {
									setPrompt("");
								}
							}),
					)
				: null}
		</main>
	);
	return screen === "assemblies" ? (
		<AssembliesEntry
			language={language}
			account={account}
			onAccount={setAccount}
			sessionReady={sessionReady}
			sessionError={error || sessionError || ""}
			signIn={signIn}
		>
			{content}
		</AssembliesEntry>
	) : (
		content
	);
}
