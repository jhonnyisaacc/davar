import {
	CREATOR_TELEGRAM_HANDLE,
	CREATOR_TELEGRAM_URL,
	SUPPORT_EMAIL,
} from "@davar/shared/settingsResources";
import { Send } from "lucide-react";
import { useState } from "react";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";
import { ResourcePage } from "./ResourcePage";

const primaryActionClass =
	"inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent-deep)] px-5 text-[15px] font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-deep)]";

const quietActionClass =
	"inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-[var(--accent-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-deep)]";

export function SupportScreen({
	language,
	onBack,
}: {
	language: AppLanguage;
	onBack: () => void;
}) {
	const { t } = useTranslation(language);
	const [copied, setCopied] = useState(false);
	const markCopied = () => {
		setCopied(true);
		window.setTimeout(() => setCopied(false), 2000);
	};
	const copyWithCommand = () => {
		try {
			const field = document.createElement("textarea");
			field.value = SUPPORT_EMAIL;
			field.setAttribute("readonly", "");
			field.style.position = "fixed";
			field.style.left = "-9999px";
			document.body.appendChild(field);
			field.select();
			const copiedAddress = document.execCommand("copy");
			field.remove();
			return copiedAddress;
		} catch {
			return false;
		}
	};
	const copyAddress = () => {
		const write = navigator.clipboard?.writeText(SUPPORT_EMAIL);
		if (!write) {
			if (copyWithCommand()) markCopied();
			return;
		}
		void write.then(markCopied, () => {
			if (copyWithCommand()) markCopied();
		});
	};
	return (
		<ResourcePage
			flat
			title={t("settings.links.support")}
			language={language}
			onBack={onBack}
		>
			<div className="flex flex-col gap-5 pt-3 pb-10">
				<p className="text-[15px] text-[var(--text-secondary)]">
					{t("support.description")}
				</p>
				<p
					dir="ltr"
					className="text-[40px] leading-tight text-[var(--text-primary)]"
					style={{ fontFamily: "Manrope, sans-serif" }}
				>
					{SUPPORT_EMAIL}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<a className={primaryActionClass} href={`mailto:${SUPPORT_EMAIL}`}>
						{t("support.emailAction")}
					</a>
					<button
						type="button"
						className={quietActionClass}
						onClick={copyAddress}
					>
						{copied ? t("support.copied") : t("support.copyAddress")}
					</button>
				</div>
			</div>
			<div className="h-px bg-[var(--border)]" />
			<div className="flex flex-wrap items-center gap-2.5 py-6">
				<Send size={16} className="shrink-0 text-[var(--text-secondary)]" />
				<p className="text-sm text-[var(--text-secondary)]">
					{t("support.telegramLead")}
				</p>
				<a
					href={CREATOR_TELEGRAM_URL}
					target="_blank"
					rel="noopener noreferrer"
					dir="ltr"
					className="text-sm font-medium text-[var(--accent-deep)]"
				>
					{CREATOR_TELEGRAM_HANDLE}
				</a>
			</div>
		</ResourcePage>
	);
}
