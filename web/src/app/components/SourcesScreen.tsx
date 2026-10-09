import {
	ATTRIBUTION_KEYS,
	TEXT_SOURCE_KEYS,
} from "@davar/shared/settingsResources";
import { useTranslation, type AppLanguage } from "../hooks/useTranslation";
import { ResourcePage } from "./ResourcePage";
import { NeumorphCard } from "./NeumorphCard";
import { linkifyAttribution } from "./HomeScreen";

export function SourcesScreen({
	language,
	onBack,
}: {
	language: AppLanguage;
	onBack: () => void;
}) {
	const { t } = useTranslation(language);
	return (
		<ResourcePage
			title={t("settings.links.textSources")}
			language={language}
			onBack={onBack}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{TEXT_SOURCE_KEYS.map((key) => (
					<NeumorphCard key={key} className="p-5 space-y-2">
						<h2 className="text-sm text-[var(--text-secondary)]">
							{t(`home.sources.${key}Label`)}
						</h2>
						<p>
							{t(`home.sources.${key}Value`)}
							{key === "dictionary" ? t("home.sources.dictionaryNote") : null}
						</p>
						{key === "besorah" && (
							<p className="text-sm leading-6 text-[var(--text-secondary)]">
								{t("verse.besorahDisclaimer.short")}
							</p>
						)}
					</NeumorphCard>
				))}
			</div>
			<NeumorphCard className="p-5 space-y-4">
				<h2 className="text-lg">{t("home.attributionTitle")}</h2>
				{ATTRIBUTION_KEYS.map((key) => (
					<p
						key={key}
						className="text-sm leading-6 text-[var(--text-secondary)]"
					>
						{linkifyAttribution(t(`home.attribution.${key}`))}
					</p>
				))}
			</NeumorphCard>
		</ResourcePage>
	);
}
