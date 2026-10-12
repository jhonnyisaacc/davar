import {
	CREATOR_TELEGRAM_HANDLE,
	CREATOR_TELEGRAM_URL,
	SUPPORT_EMAIL,
} from "@davar/shared/settingsResources";
import { useTranslation, type AppLanguage } from "../hooks/useTranslation";
import { ResourcePage } from "./ResourcePage";
import { NeumorphCard } from "./NeumorphCard";

export function SupportScreen({
	language,
	onBack,
}: {
	language: AppLanguage;
	onBack: () => void;
}) {
	const { t } = useTranslation(language);
	const action =
		"inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent-deep)] px-5 py-3 text-white";
	return (
		<ResourcePage
			title={t("settings.links.support")}
			language={language}
			onBack={onBack}
		>
			<p className="text-[var(--text-secondary)]">{t("support.description")}</p>
			<NeumorphCard className="p-5 space-y-4">
				<h2 className="text-sm text-[var(--text-secondary)]">
					{t("support.emailLabel")}
				</h2>
				<p dir="ltr" className="text-xl">
					{SUPPORT_EMAIL}
				</p>
				<a className={action} href={`mailto:${SUPPORT_EMAIL}`}>
					{t("support.emailAction")}
				</a>
			</NeumorphCard>
			<NeumorphCard className="p-5 space-y-4">
				<h2>{t("support.creator")}</h2>
				<p dir="ltr">{CREATOR_TELEGRAM_HANDLE}</p>
				<a
					className={action}
					href={CREATOR_TELEGRAM_URL}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t("support.telegramAction")}
				</a>
			</NeumorphCard>
		</ResourcePage>
	);
}
