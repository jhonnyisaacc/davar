import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import {
	GITHUB_URL,
	SETTINGS_RESOURCES,
} from "@davar/shared/settingsResources";
import { useTranslation, type AppLanguage } from "../hooks/useTranslation";
import type { RouteScreen } from "../utils/routeState";

export function SettingsResources({
	language,
	onOpenScreen,
}: {
	language: AppLanguage;
	onOpenScreen: (screen: RouteScreen) => void;
}) {
	const { t } = useTranslation(language);
	const Chevron = language === "he" ? ChevronLeft : ChevronRight;
	const row =
		"flex min-h-[50px] w-full items-center justify-between gap-3 py-2.5 text-[15px] text-start hover:text-[var(--primary)] transition-colors";
	return (
		<section
			dir={language === "he" ? "rtl" : "ltr"}
			aria-labelledby="settings-resources-title"
			className="mx-auto max-w-2xl pt-5 text-[var(--text-primary)]"
		>
			<h2
				id="settings-resources-title"
				className="mb-2 text-[13px] font-medium text-[var(--text-secondary)]"
			>
				{t("settings.links.title")}
			</h2>
			{SETTINGS_RESOURCES.map((item) => (
				<button
					key={item.id}
					type="button"
					className={row}
					onClick={() => onOpenScreen(item.id)}
				>
					{t(item.label)}
					<Chevron size={18} />
				</button>
			))}
			<a
				href={GITHUB_URL}
				target="_blank"
				rel="noopener noreferrer"
				className={row}
			>
				{t("settings.links.github")}
				<ArrowUpRight size={18} />
			</a>
		</section>
	);
}
