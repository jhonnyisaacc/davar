import {
	Bug,
	FileText,
	Heart,
	Info,
	MessageCircle,
	Shield,
} from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { getSupportTelegramUrl, useTranslation } from "../hooks/useTranslation";

interface HomeScreenProps {
	language: "en" | "es" | "he";
	onFeaturesClick: () => void;
	onDonateClick: () => void;
}

const ATTRIBUTION_URL = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

function attributionHref(part: string) {
	const trimmed = part.replace(/[),.;]+$/u, "");
	return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function linkifyAttribution(text: string) {
	return text.split(ATTRIBUTION_URL).map((part, index) => {
		const isUrl = part.startsWith("http") || part.startsWith("www.");
		if (!isUrl) {
			return part;
		}
		const href = attributionHref(part);
		const visible = part.replace(/[),.;]+$/u, "");
		const trailing = part.slice(visible.length);
		return (
			<span key={`${href}-${index}`}>
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="underline decoration-[var(--copper-highlight)] underline-offset-2 hover:text-[var(--copper-highlight)]"
				>
					{visible}
				</a>
				{trailing}
			</span>
		);
	});
}

export function HomeScreen({
	language,
	onFeaturesClick,
	onDonateClick,
}: HomeScreenProps) {
	const { t } = useTranslation(language);
	const sourceItems = [
		{
			label: t("home.sources.hebrewTextLabel"),
			value: t("home.sources.hebrewTextValue"),
		},
		{
			label: t("home.sources.dictionaryLabel"),
			value: t("home.sources.dictionaryValue"),
			note: t("home.sources.dictionaryNote"),
		},
		{
			label: t("home.sources.englishTranslationLabel"),
			value: t("home.sources.englishTranslationValue"),
		},
		{
			label: t("home.sources.spanishTranslationLabel"),
			value: t("home.sources.spanishTranslationValue"),
		},
		{
			label: t("home.sources.besorahLabel"),
			value: t("home.sources.besorahValue"),
		},
		{
			label: t("home.sources.greekTextLabel"),
			value: t("home.sources.greekTextValue"),
		},
		{
			label: t("home.sources.greekTagsLabel"),
			value: t("home.sources.greekTagsValue"),
		},
		{
			label: t("home.sources.greekLexiconLabel"),
			value: t("home.sources.greekLexiconValue"),
		},
	];
	const attributionItems = [
		t("home.attribution.stepbible"),
		t("home.attribution.sblgnt"),
		t("home.attribution.ubs"),
	];
	const aboutItems = [
		{ label: t("home.aboutItems.terms"), Icon: FileText, href: "/terms" },
		{ label: t("home.aboutItems.privacy"), Icon: Shield, href: "/privacy" },
		{
			label: t("home.aboutItems.support"),
			Icon: MessageCircle,
			href: getSupportTelegramUrl(language),
			target: "_blank",
		},
		{
			label: t("home.aboutItems.bug"),
			Icon: Bug,
			href: "https://github.com/jhonnyisaacc/davar/issues/new",
			target: "_blank",
		},
		{
			label: t("home.aboutItems.github"),
			Icon: FaGithub,
			href: "https://github.com/jhonnyisaacc/davar",
			target: "_blank",
		},
		{
			label: t("home.aboutItems.feedback"),
			Icon: Info,
			href: "/feedback",
		},
	];

	return (
		<div className="space-y-4 pb-24">
			<div className="min-h-[40vh] flex items-center justify-center">
				<div className="text-center">
					<div className="text-sm tracking-[0.3em] uppercase text-[var(--copper-highlight)] mb-6">
						{t("home.sourcesTitle")}
					</div>
					<div className="space-y-3">
						{sourceItems.map((item) => (
							<div
								key={item.label}
								className="flex items-center justify-center gap-2 text-sm text-[var(--text-primary)]"
							>
								<span style={{ fontFamily: "'Inter', sans-serif" }}>
									{item.label}{" "}
									<span className="font-semibold">{item.value}</span>
									{item.note ?? ""}
								</span>
							</div>
						))}
					</div>
					<div className="mx-auto mt-8 max-w-xl space-y-3 px-4">
						<div className="text-sm tracking-[0.3em] uppercase text-[var(--copper-highlight)]">
							{t("home.attributionTitle")}
						</div>
						{attributionItems.map((notice) => (
							<p
								key={notice.slice(0, 48)}
								className="text-xs leading-relaxed text-[var(--text-secondary-muted)]"
								style={{ fontFamily: "'Inter', sans-serif" }}
							>
								{linkifyAttribution(notice)}
							</p>
						))}
					</div>
				</div>
			</div>

			<div className="flex items-center justify-center gap-3 pb-2">
				<button
					type="button"
					onClick={onFeaturesClick}
					className="rounded-full px-4 py-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
					style={{
						fontFamily: "'Inter', sans-serif",
						background:
							"linear-gradient(135deg, rgba(198,143,85,0.9), rgba(176,122,60,0.7))",
						color: "#ffffff",
						border: "1px solid rgba(198,143,85,0.65)",
						boxShadow: "0 8px 20px rgba(13,39,80,0.16)",
					}}
					aria-label={t("navigation.openFeatures")}
				>
					<span className="text-[11px] tracking-[0.2em] uppercase">
						{t("navigation.features")}
					</span>
				</button>

				<button
					type="button"
					onClick={onDonateClick}
					className="flex items-center gap-2 rounded-full px-4 py-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
					style={{
						fontFamily: "'Inter', sans-serif",
						backgroundColor: "var(--accent-darker)",
						color: "#faf4e6",
						boxShadow: "4px 4px 10px var(--neomorph-shadow-dark)",
					}}
					aria-label={t("navigation.donate")}
				>
					<Heart className="w-3.5 h-3.5" />
					<span className="text-[11px] tracking-[0.2em] uppercase">
						{t("navigation.donate")}
					</span>
				</button>
			</div>

			<div className="min-h-[30vh] flex items-center justify-center">
				<div className="text-center">
					<div className="text-sm tracking-[0.3em] uppercase text-[var(--copper-highlight)] mb-6">
						{t("home.aboutTitle")}
					</div>
					<div className="space-y-3">
						{aboutItems.map((item) => (
							<a
								key={item.label}
								href={item.href}
								{...(item.target && {
									target: item.target,
									rel: "noopener noreferrer",
								})}
								className="flex items-center justify-center gap-2 text-sm text-[var(--text-primary)] hover:text-[var(--text-secondary-muted)]"
							>
								<item.Icon className="w-4 h-4 text-[var(--copper-highlight)]" />
								<span style={{ fontFamily: "'Inter', sans-serif" }}>
									{item.label}
								</span>
							</a>
						))}
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-center gap-6 pt-2">
				<a
					href="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
					target="_blank"
					rel="noopener noreferrer"
					aria-label={t("common.downloadOnAppStore")}
				>
					<img
						src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
						alt={t("common.downloadOnAppStore")}
						className="h-12"
					/>
				</a>
				<a
					href="https://play.google.com/intl/en_us/badges/images/generic/en_badge_web_generic.png"
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
