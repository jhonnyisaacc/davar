import { useEffect, useState } from "react";
import { productApi } from "../services/productApi";
export function SandboxBanner() {
	const [mailbox, setMailbox] = useState<string | null>(null);
	useEffect(() => {
		if (process.env.PUBLIC_DEV_SANDBOX !== "1") return;
		void productApi
			.request<{ sandbox: boolean; mailbox_url: string }>(
				"/development/status",
				{ public: true },
			)
			.then((s) => {
				if (s.sandbox) setMailbox(s.mailbox_url);
			})
			.catch(() => {});
	}, []);
	return mailbox ? (
		<aside className="text-center text-xs p-2 bg-[var(--accent-glow)]">
			Development sandbox · synthetic data · no live AI ·{" "}
			<a href={mailbox} target="_blank" rel="noreferrer" className="underline">
				Open local email inbox
			</a>
		</aside>
	) : null;
}
