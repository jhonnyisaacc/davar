import { PLAY_STORE_URL } from "@davar/shared/settingsResources";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";

export function PlayStoreBadge({ language }: { language: AppLanguage }) {
	const { t } = useTranslation(language);
	const label = t("common.getOnGooglePlay");
	return (
		<a
			href={PLAY_STORE_URL}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={label}
		>
			<img
				src="https://play.google.com/intl/en_us/badges/images/generic/en_badge_web_generic.png"
				alt={label}
				className="h-14"
			/>
		</a>
	);
}
