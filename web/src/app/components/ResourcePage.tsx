import { useEffect, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation, type AppLanguage } from "../hooks/useTranslation";

export function ResourcePage({
	title,
	language,
	onBack,
	children,
}: {
	title: string;
	language: AppLanguage;
	onBack: () => void;
	children: ReactNode;
}) {
	const { t } = useTranslation(language);
	useEffect(() => {
		window.scrollTo({ top: 0, behavior: "instant" });
	}, []);
	const Back = language === "he" ? ArrowRight : ArrowLeft;
	return (
		<main
			dir={language === "he" ? "rtl" : "ltr"}
			className="mx-auto max-w-2xl space-y-6 pb-32 text-[var(--text-primary)]"
		>
			<button
				type="button"
				onClick={onBack}
				className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)]"
			>
				<Back size={16} />
				{t("settings.title")}
			</button>
			<h1
				className="text-[32px] font-normal"
				style={{ fontFamily: "Manrope, sans-serif" }}
			>
				{title}
			</h1>
			{children}
		</main>
	);
}
