import {
	type Account,
	SIGN_IN_PROVIDERS,
} from "@davar/shared/productContracts";
import { useState } from "react";
import { NeumorphCard } from "../../components/NeumorphCard";
import { useProductCapabilities } from "../../hooks/useProductCapabilities";
import { type AppLanguage, useTranslation } from "../../hooks/useTranslation";
import { productApi } from "../../services/productApi";
import { productControls } from "../product/controls";
export function ProductSignIn({
	language,
	account,
	busy,
	run,
	onStatus: setError,
}: {
	language: AppLanguage;
	account: Account | null;
	busy: boolean;
	run: (action: () => Promise<void>) => Promise<void>;
	onStatus: (message: string) => void;
}) {
	const [email, setEmail] = useState("");
	const { capabilities } = useProductCapabilities();
	const { t } = useTranslation(language);
	if (!capabilities.flags.account_sign_in) {
		return (
			<NeumorphCard className="p-6">
				<p>{t("featureAvailability.signInUnavailable")}</p>
			</NeumorphCard>
		);
	}
	const { field, button } = productControls(busy);
	return (
		<NeumorphCard className="p-6 space-y-4">
			<p>
				{account
					? "Link a verified identity to this account"
					: "Scripture is always available without an account."}
			</p>
			{SIGN_IN_PROVIDERS.filter((p) => p !== "email").map((p) => (
				<span key={p}>
					{button(
						p,
						() =>
							void run(async () => {
								const result = await productApi.request<{
									authorization_url: string;
								}>(`/auth/${p}/start`, {
									method: "POST",
									public: !account,
									body: {
										return_uri:
											window.location.origin + window.location.pathname,
										link: !!account,
									},
								});
								window.location.assign(result.authorization_url);
							}),
					)}
				</span>
			))}
			{field("Email", email, setEmail)}
			{button(
				"Send magic link",
				() =>
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
						setError("Check your email for a sign-in link.");
					}),
			)}
		</NeumorphCard>
	);
}
