import { useEffect, useState } from "react";
import { productApi } from "../services/productApi";

function isDevelopmentSandbox() {
	try {
		return process.env.PUBLIC_DEV_SANDBOX === "1";
	} catch {
		return false;
	}
}
export function SandboxBanner() {
	const [mailbox, setMailbox] = useState<string | null>(null);
	const [liveAi, setLiveAi] = useState(false);
	useEffect(() => {
		if (!isDevelopmentSandbox()) return;
		void productApi
			.request<{
				sandbox: boolean;
				mailbox_url: string;
				commentary_provider?: string;
			}>("/development/status", { public: true })
			.then((s) => {
				if (s.sandbox) {
					setMailbox(s.mailbox_url);
					setLiveAi(s.commentary_provider === "openrouter");
				}
			})
			.catch(() => {});
	}, []);
	return mailbox ? (
		<aside className="text-center text-xs p-2 bg-[var(--accent-glow)]">
			Development sandbox · synthetic data ·{" "}
			{liveAi ? "live AI via OpenRouter" : "no live AI"} ·{" "}
			<a href={mailbox} target="_blank" rel="noreferrer" className="underline">
				Open local email inbox
			</a>
		</aside>
	) : null;
}
