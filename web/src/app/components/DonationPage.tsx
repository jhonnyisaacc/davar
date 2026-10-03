import { useTranslation, type AppLanguage } from "../hooks/useTranslation";
import { ResourcePage } from "./ResourcePage";
import { DonateScreen } from "./DonateScreen";

export function DonationPage({
	language,
	onBack,
}: {
	language: AppLanguage;
	onBack: () => void;
}) {
	const { t } = useTranslation(language);
	return (
		<ResourcePage
			title={t("settings.links.donate")}
			language={language}
			onBack={onBack}
		>
			<DonateScreen language={language} />
		</ResourcePage>
	);
}
