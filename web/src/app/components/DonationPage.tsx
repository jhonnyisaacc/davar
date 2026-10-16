import { type AppLanguage, useTranslation } from "../hooks/useTranslation";
import { DonateScreen } from "./DonateScreen";
import { ResourcePage } from "./ResourcePage";

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
			flat
			title={t("settings.links.donate")}
			lede={t("donate.intro")}
			language={language}
			onBack={onBack}
		>
			<DonateScreen language={language} />
		</ResourcePage>
	);
}
