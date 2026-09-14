import { Lightbulb } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";

interface FeaturesScreenProps {
	language: AppLanguage;
}

export function FeaturesScreen({ language }: FeaturesScreenProps) {
	const { t, get } = useTranslation(language);
	const proposalItems = get<string[]>("features.items", []);
	return (
		<div className="min-h-[60vh] flex items-center justify-center">
			<div className="text-center">
				<div className="text-sm tracking-[0.3em] uppercase text-[var(--copper-highlight)] mb-6">
					{t("features.title")}
				</div>
				<div className="space-y-3">
					{proposalItems.map((item) => (
						<div
							key={item}
							className="flex items-center justify-center gap-2 text-sm text-[var(--text-primary)]"
						>
							<Lightbulb className="w-4 h-4 text-[var(--copper-highlight)]" />
							<span style={{ fontFamily: "'Inter', sans-serif" }}>{item}</span>
						</div>
					))}
				</div>
				<div className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--text-secondary-muted)]">
					<FaGithub className="w-4 h-4" />
					<a
						href="https://github.com/jhonnyisaacc/davar"
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2 hover:text-[var(--text-primary)]"
					>
						{t("features.repositoryLabel")}
					</a>
					<span>{t("features.openSourceNote")}</span>
				</div>
			</div>
		</div>
	);
}
