import {
	CREATOR_TELEGRAM_HANDLE,
	CREATOR_TELEGRAM_URL,
	PLAY_STORE_URL,
} from "@davar/shared/settingsResources";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";
import { KoFiWidget } from "./KoFiWidget";
import { NeumorphCard } from "./NeumorphCard";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/jhonnyisaacc";

const action =
	"inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent-deep)] px-5 py-3 text-white";

const GithubSponsorsIcon = ({ className }: { className?: string }) => (
	<svg
		className={className}
		viewBox="0 0 16 16"
		fill="currentColor"
		role="img"
		aria-label="GitHub Sponsors"
	>
		<title>GitHub Sponsors</title>
		<path
			fillRule="evenodd"
			d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.75.75 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5zM8 14.25l-.345.666-.002-.001-.006-.003-.018-.01a7.643 7.643 0 01-.31-.17 22.075 22.075 0 01-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.08 22.08 0 01-3.744 2.584l-.018.01-.006.003h-.002L8 14.25zm0 0l.345.666a.752.752 0 01-.69 0L8 14.25z"
		/>
	</svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M9.993 15.43 9.66 20.06c.506 0 .726-.217.99-.478l2.37-2.28 4.91 3.595c.902.498 1.54.235 1.76-.832l3.2-15.02c.293-1.326-.48-1.845-1.33-1.53L2.1 9.18c-1.29.49-1.27 1.19-.22 1.51l4.86 1.52 11.28-7.12c.53-.35 1.01-.16.61.19L9.993 15.43z" />
	</svg>
);

interface DonateScreenProps {
	language: AppLanguage;
}

export function DonateScreen({ language }: DonateScreenProps) {
	const { t } = useTranslation(language);
	return (
		<div className="space-y-6">
			<NeumorphCard className="p-5 space-y-4">
				<KoFiWidget />
				<a
					href={GITHUB_SPONSORS_URL}
					target="_blank"
					rel="noopener noreferrer"
					className={action}
				>
					<GithubSponsorsIcon className="h-5 w-5" />
					<span>{t("donate.githubSponsor")}</span>
				</a>
			</NeumorphCard>

			<NeumorphCard className="p-5 space-y-4">
				<p className="text-[var(--text-secondary)]">
					{t("donate.contactPrefix")}{" "}
					<span className="inline-flex items-baseline gap-2">
						<span className="inline-flex items-baseline gap-1">
							<TelegramIcon className="h-4 w-4" />
							{t("donate.telegramLabel")}
						</span>
						<a
							href={CREATOR_TELEGRAM_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-2"
						>
							{CREATOR_TELEGRAM_HANDLE}
						</a>
					</span>
				</p>
			</NeumorphCard>

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
	);
}
