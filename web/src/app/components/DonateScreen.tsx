import {
	CREATOR_TELEGRAM_HANDLE,
	CREATOR_TELEGRAM_URL,
	PLAY_STORE_URL,
} from "@davar/shared/settingsResources";
import { Coffee, Heart, Send } from "lucide-react";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";
import { ResourceLinkRow } from "./ResourcePage";

const KOFI_URL = "https://ko-fi.com/jhonnyisaacc";
const GITHUB_SPONSORS_URL = "https://github.com/sponsors/jhonnyisaacc";

interface DonateScreenProps {
	language: AppLanguage;
}

export function DonateScreen({ language }: DonateScreenProps) {
	const { t } = useTranslation(language);
	return (
		<div>
			<div className="border-t border-[var(--border)]">
				<ResourceLinkRow
					href={KOFI_URL}
					icon={Coffee}
					label={t("donate.kofiDetail")}
					value={t("donate.kofiName")}
					action={t("donate.give")}
				/>
				<ResourceLinkRow
					href={GITHUB_SPONSORS_URL}
					icon={Heart}
					label={t("donate.monthly")}
					value="GitHub Sponsors"
					action={t("donate.sponsor")}
				/>
				<ResourceLinkRow
					href={CREATOR_TELEGRAM_URL}
					icon={Send}
					label={t("donate.otherWays")}
					value={CREATOR_TELEGRAM_HANDLE}
					action={t("donate.ask")}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-4 pt-6">
				<p className="text-[13px] text-[var(--text-secondary)]">
					{t("donate.alsoOnAndroid")}
				</p>
				<a
					href={PLAY_STORE_URL}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={t("common.getOnGooglePlay")}
				>
					<img
						src="https://play.google.com/intl/en_us/badges/images/generic/en_badge_web_generic.png"
						alt={t("common.getOnGooglePlay")}
						className="h-14"
					/>
				</a>
			</div>
		</div>
	);
}
