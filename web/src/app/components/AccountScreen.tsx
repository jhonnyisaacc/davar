import { useCallback, useEffect, useState } from "react";
import {
	SIGN_IN_PROVIDERS,
	type Account,
} from "@davar/shared/productContracts";
import { acceptSignIn, productApi } from "../services/productApi";
import { useTranslation } from "../hooks/useTranslation";
import { ResourcePage } from "./ResourcePage";
import { NeumorphCard } from "./NeumorphCard";
import { AccountSettings } from "./AccountSettings";
import type { SettingsScreenProps } from "./SettingsScreen";

export function AccountScreen({
	onBack,
	...props
}: SettingsScreenProps & { onBack: () => void }) {
	const { t } = useTranslation(props.language);
	const unavailable = t("settings.account.unavailable");
	const [account, setAccount] = useState<Account | null>(null);
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState("");
	const run = useCallback(
		async (action: () => Promise<void>) => {
			setBusy(true);
			setStatus("");
			try {
				await action();
			} catch {
				setStatus(unavailable);
			} finally {
				setBusy(false);
			}
		},
		[unavailable],
	);
	useEffect(() => {
		let active = true;
		const code = new URLSearchParams(window.location.search).get("code");
		if (code) window.history.replaceState(null, "", window.location.pathname);
		if (code || productApi.authenticated()) {
			const request = code
				? acceptSignIn(code)
				: productApi.request<Account>("/account", { cache: true });
			request
				.then((result) => {
					if (active) setAccount(result);
				})
				.catch(() => {
					if (active) setStatus(unavailable);
				});
		}
		return () => {
			active = false;
		};
	}, [unavailable]);
	const actionClass =
		"min-h-11 rounded-full border border-[var(--primary)] px-5 py-3 disabled:opacity-50";
	return (
		<ResourcePage
			language={props.language}
			onBack={onBack}
			title={t(account ? "settings.account.title" : "settings.account.signIn")}
		>
			<NeumorphCard className="p-5 space-y-4">
				<p>
					{t(
						account
							? "settings.account.linkDescription"
							: "settings.account.description",
					)}
				</p>
				<div className="flex flex-wrap gap-3">
					{SIGN_IN_PROVIDERS.filter((provider) => provider !== "email").map(
						(provider) => (
							<button
								key={provider}
								type="button"
								className={actionClass}
								disabled={busy}
								onClick={() =>
									void run(async () => {
										const result = await productApi.request<{
											authorization_url: string;
										}>(`/auth/${provider}/start`, {
											method: "POST",
											public: !account,
											body: {
												return_uri:
													window.location.origin + window.location.pathname,
												link: !!account,
											},
										});
										window.location.assign(result.authorization_url);
									})
								}
							>
								{provider === "x"
									? "X"
									: provider[0].toUpperCase() + provider.slice(1)}
							</button>
						),
					)}
				</div>
				<form
					className="space-y-3"
					onSubmit={(event) => {
						event.preventDefault();
						void run(async () => {
							await productApi.request("/auth/email/start", {
								method: "POST",
								public: !account,
								body: {
									email,
									link: !!account,
									return_uri: window.location.origin + window.location.pathname,
								},
							});
							setStatus(t("settings.account.emailSent"));
						});
					}}
				>
					<label className="flex flex-col gap-2">
						{t("settings.account.emailLabel")}
						<input
							required
							type="email"
							autoComplete="email"
							dir="ltr"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className="rounded-xl border border-[var(--neomorph-border)] bg-transparent p-3"
						/>
					</label>
					<button type="submit" disabled={busy} className={actionClass}>
						{t("settings.account.emailAction")}
					</button>
				</form>
			</NeumorphCard>
			{status ? <p role="status">{status}</p> : null}
			{account ? (
				<>
					<AccountSettings {...props} />
					<button
						type="button"
						disabled={busy}
						className={actionClass}
						onClick={() =>
							void run(async () => {
								try {
									await productApi.request("/auth/session", {
										method: "DELETE",
									});
								} finally {
									await productApi.setSession(null, null);
									setAccount(null);
								}
							})
						}
					>
						{t("settings.account.signOut")}
					</button>
				</>
			) : null}
		</ResourcePage>
	);
}
