import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";

export function ResourceLinkRow({
	href,
	label,
	value,
	action,
	icon: Icon,
}: {
	href: string;
	label: string;
	value: string;
	action: string;
	icon: LucideIcon;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="flex min-h-11 w-full items-center gap-4 border-b border-[var(--border)] py-[18px] text-start"
		>
			<Icon size={20} className="shrink-0 text-[var(--accent-deep)]" />
			<span className="min-w-0 flex-1">
				<span className="block text-xs text-[var(--text-secondary)]">
					{label}
				</span>
				<span className="mt-0.5 block text-[17px] text-[var(--text-primary)]">
					{value}
				</span>
			</span>
			<span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--accent-deep)]">
				{action}
				<ArrowUpRight size={16} className="rtl:-scale-x-100" />
			</span>
		</a>
	);
}

export function ResourcePage({
	title,
	lede,
	flat = false,
	language,
	onBack,
	children,
}: {
	title: string;
	lede?: string;
	flat?: boolean;
	language: AppLanguage;
	onBack: () => void;
	children: ReactNode;
}) {
	const { t } = useTranslation(language);
	useEffect(() => {
		window.scrollTo({ top: 0, behavior: "instant" });
	}, []);
	const Back = language === "he" ? ArrowRight : ArrowLeft;
	const heading = (
		<h1
			className="text-[32px] font-normal"
			style={{ fontFamily: "Manrope, sans-serif" }}
		>
			{title}
		</h1>
	);
	return (
		<main
			dir={language === "he" ? "rtl" : "ltr"}
			className={
				flat
					? "mx-auto w-full max-w-[672px] pb-32 text-[var(--text-primary)]"
					: "mx-auto max-w-2xl space-y-6 pb-32 text-[var(--text-primary)]"
			}
		>
			<button
				type="button"
				onClick={onBack}
				className="inline-flex h-11 items-center gap-2 text-sm text-[var(--text-secondary)]"
			>
				<Back size={16} />
				{t("settings.title")}
			</button>
			{flat ? (
				<header className={lede ? "flex flex-col gap-2 pt-4 pb-8" : "pt-4"}>
					{heading}
					{lede ? (
						<p className="text-[15px] text-[var(--text-secondary)]">{lede}</p>
					) : null}
				</header>
			) : (
				heading
			)}
			{children}
		</main>
	);
}
