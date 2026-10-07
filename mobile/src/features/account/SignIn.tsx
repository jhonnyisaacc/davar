import { authReturnUri } from "@davar/shared/authReturnUri";
import { Platform } from "react-native";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import {
	SIGN_IN_PROVIDERS,
	type SignInProvider,
} from "@davar/shared/productContracts";
import { productApi, completeSignIn } from "./session";
import { Action, Card, Copy, Field } from "../product/ui";
export function SignIn({
	link = false,
	telegramNotifications = false,
}: {
	link?: boolean;
	telegramNotifications?: boolean;
}) {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	async function start(provider: SignInProvider) {
		setBusy(true);
		setStatus("");
		try {
			const returnUri = authReturnUri(
				Platform.OS,
				Platform.OS === "web" ? globalThis.location.origin : undefined,
			);
			const result = await productApi.request<{
				authorization_url?: string;
				email_sent?: boolean;
			}>(`/auth/${provider}/start`, {
				method: "POST",
				public: !link,
				body: {
					return_uri: returnUri,
					email,
					link,
					notification_consent: telegramNotifications,
				},
			});
			if (result.email_sent) {
				setStatus("Check your email for a sign-in link.");
				return;
			}
			if (result.authorization_url) {
				const auth = await WebBrowser.openAuthSessionAsync(
					result.authorization_url,
					returnUri,
				);
				if (auth.type === "success") {
					const code = new URL(auth.url).searchParams.get("code");
					if (!code) throw new Error("Missing sign-in code");
					await completeSignIn(code);
				}
			}
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Sign-in unavailable");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Card>
			<Copy>
				{link
					? "Link another sign-in method"
					: "Sign in to continue. Scripture is always available without an account."}
			</Copy>
			{SIGN_IN_PROVIDERS.filter((p) =>
				telegramNotifications ? p === "telegram" : p !== "email",
			).map((provider) => (
				<Action
					key={provider}
					label={
						telegramNotifications
							? "Allow Telegram notifications"
							: provider === "x"
								? "X"
								: provider[0].toUpperCase() + provider.slice(1)
					}
					disabled={busy}
					onPress={() => void start(provider)}
				/>
			))}
			{!telegramNotifications ? (
				<>
					<Field label="Email" value={email} onChange={setEmail} />
					<Action
						label="Send magic link"
						disabled={busy || !email}
						onPress={() => void start("email")}
					/>
				</>
			) : null}
			{status ? <Copy>{status}</Copy> : null}
		</Card>
	);
}
