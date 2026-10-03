import { Fragment, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
	SHARED_SETTINGS_ORDER,
	canUseSeferStyle,
	isSeferStyleVisible,
	type SharedSettingId,
} from "@davar/shared/settingsOrder";
import type { BesorahLanguage } from "@davar/shared/greekBesorah";
import { useTranslation } from "../hooks/useTranslation";
import { productApi } from "../services/productApi";
import { SettingsResources } from "./SettingsResources";
import { CalendarCityNotice } from "./CalendarCityNotice";
import { PillToggle } from "./PillToggle";
import type { RouteScreen } from "../utils/routeState";

export interface SettingsScreenProps {
	theme: "light" | "dark";
	onThemeChange: (theme: "light" | "dark") => void;
	language: "en" | "es" | "he";
	onLanguageChange: (language: "en" | "es" | "he") => void;
	besorahLanguage: BesorahLanguage;
	onBesorahLanguageChange: (language: BesorahLanguage) => void;
	greekAvailable: boolean;
	besorahTextVersion: "delitzsch" | "hutter";
	onBesorahTextVersionChange: (version: "delitzsch" | "hutter") => void;
	showQumran: boolean;
	onQumranChange: (show: boolean) => void;
	showFullChapter: boolean;
	onFullChapterChange: (show: boolean) => void;
	showCalendarDayPill?: boolean;
	onCalendarDayPillChange?: (show: boolean) => void;
	seferMode: boolean;
	onSeferModeChange: (show: boolean) => void;
	hebrewOnly: boolean;
	onHebrewOnlyChange: (show: boolean) => void;
	translationOnly?: boolean;
	onTranslationOnlyChange?: (show: boolean) => void;
	onAccountClick?: () => void;
	onDesignSystemClick?: () => void;
	onMobileDesignGuideClick?: () => void;
}

export function SettingsScreen(
	props: SettingsScreenProps & { onOpenScreen?: (screen: RouteScreen) => void },
) {
	const { t } = useTranslation(props.language);
	const rtl = props.language === "he";
	const Chevron = rtl ? ChevronLeft : ChevronRight;
	const translationOnly = props.translationOnly ?? false;
	const rowClass =
		"flex min-h-[50px] items-center justify-between gap-3 py-2.5";
	const toggle = (
		label: string,
		checked: boolean,
		change: ((value: boolean) => void) | undefined,
		disabled = false,
		reason?: string,
	) => (
		<div className={rowClass}>
			<span className={`flex-1 text-[15px] ${disabled ? "opacity-55" : ""}`}>
				{label}
			</span>
			<PillToggle
				label={label}
				value={checked}
				onChange={(value) => change?.(value)}
				disabled={disabled || !change}
				disabledReason={reason}
			/>
		</div>
	);
	const select = <T extends string>(
		label: string,
		value: T,
		change: (value: T) => void,
		options: { value: T; label: string }[],
	) => (
		<div className={rowClass}>
			<span className="flex-1 text-[15px]">{label}</span>
			<select
				aria-label={label}
				value={value}
				onChange={(event) => change(event.target.value as T)}
				className="min-h-[30px] max-w-[50%] cursor-pointer border-0 bg-transparent text-[13px] text-[var(--text-secondary)] focus-visible:outline-[var(--primary)]"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	);
	const renderSetting = (id: SharedSettingId): ReactNode => {
		switch (id) {
			case "theme":
				return toggle(
					t("settings.theme.title"),
					props.theme === "dark",
					(dark) => props.onThemeChange(dark ? "dark" : "light"),
				);
			case "language":
				return select(
					t("settings.language.title"),
					props.language,
					props.onLanguageChange,
					[
						{ value: "en", label: t("languages.en") },
						{ value: "es", label: t("languages.es") },
						{ value: "he", label: t("languages.he") },
					],
				);
			case "besorahLanguage":
				return props.greekAvailable
					? select(
							t("settings.besorahLanguage.title"),
							props.besorahLanguage,
							props.onBesorahLanguageChange,
							[
								{
									value: "hebrew",
									label: t("settings.besorahLanguage.hebrew"),
								},
								{ value: "greek", label: t("settings.besorahLanguage.greek") },
							],
						)
					: null;
			case "besorahTextVersion":
				return props.besorahLanguage === "greek"
					? null
					: select(
							t("settings.besorahTextVersion.title"),
							props.besorahTextVersion,
							props.onBesorahTextVersionChange,
							[
								{
									value: "delitzsch",
									label: t("settings.besorahTextVersion.delitzsch"),
								},
								{
									value: "hutter",
									label: t("settings.besorahTextVersion.hutter"),
								},
							],
						);
			case "calendarDayPill":
				return (
					<div>
						<div className={rowClass}>
							<div className="flex-1 space-y-1">
								<span className="text-[15px]">
									{t("settings.calendarDayPill.title")}
								</span>
								<p className="text-xs text-[var(--text-secondary)]">
									{t("settings.calendarDayPill.subtitle")}
								</p>
							</div>
							<PillToggle
								label={t("settings.calendarDayPill.title")}
								value={props.showCalendarDayPill ?? false}
								onChange={(value) => props.onCalendarDayPillChange?.(value)}
								disabled={!props.onCalendarDayPillChange}
							/>
						</div>
						<CalendarCityNotice
							enabled={props.showCalendarDayPill ?? false}
							language={props.language}
							onChooseCity={
								props.onOpenScreen
									? () => props.onOpenScreen?.("widgets")
									: undefined
							}
						/>
					</div>
				);
			case "fullChapter":
				return (
					<>
						{toggle(
							t("settings.fullChapter.title"),
							props.showFullChapter,
							props.onFullChapterChange,
						)}
						{toggle(
							t("settings.translationOnly.title"),
							translationOnly,
							props.onTranslationOnlyChange,
						)}
					</>
				);
			case "seferStyle":
				return isSeferStyleVisible(props.showFullChapter)
					? toggle(
							t("settings.seferStyle.title"),
							props.seferMode,
							props.onSeferModeChange,
							!canUseSeferStyle({
								showFullChapter: props.showFullChapter,
								hebrewOnly: props.hebrewOnly,
								translationOnly,
							}),
							t("settings.seferStyle.warningMessage"),
						)
					: null;
			case "hebrewOnly":
				return toggle(
					t("settings.hebrewOnly.title"),
					props.hebrewOnly,
					props.onHebrewOnlyChange,
					translationOnly,
					t("settings.translationOnly.disablesHebrewFeatures"),
				);
			case "qumran":
				return toggle(
					t("settings.qumran.title"),
					props.showQumran,
					props.onQumranChange,
					translationOnly,
					t("settings.translationOnly.disablesHebrewFeatures"),
				);
		}
	};
	return (
		<main
			dir={rtl ? "rtl" : "ltr"}
			className="mx-auto max-w-2xl space-y-1 pb-32 text-[var(--text-primary)]"
			style={{ fontFamily: "Inter, sans-serif" }}
		>
			<h1
				className="mb-2 text-[32px] font-normal"
				style={{ fontFamily: "Manrope, sans-serif" }}
			>
				{t("settings.title")}
			</h1>
			<button
				type="button"
				className={`${rowClass} w-full text-start`}
				onClick={props.onAccountClick}
			>
				<span className="text-[15px]">{t("settings.account.title")}</span>
				<span className="inline-flex items-center gap-1 text-[13px] text-[var(--accent-deep)]">
					{t(
						productApi.authenticated()
							? "settings.account.manage"
							: "settings.account.signIn",
					)}
					<Chevron size={16} />
				</span>
			</button>
			{SHARED_SETTINGS_ORDER.map((id) => (
				<Fragment key={id}>{renderSetting(id)}</Fragment>
			))}
			{[
				["settings.designSystemTitle", props.onDesignSystemClick],
				["settings.mobileDesignGuideTitle", props.onMobileDesignGuideClick],
			].map(([label, action]) =>
				typeof action === "function" ? (
					<button
						key={String(label)}
						type="button"
						className={`${rowClass} w-full text-start text-[15px]`}
						onClick={action}
					>
						{t(String(label))}
						<Chevron size={18} />
					</button>
				) : null,
			)}
			{props.onOpenScreen ? (
				<SettingsResources
					language={props.language}
					onOpenScreen={props.onOpenScreen}
				/>
			) : null}
		</main>
	);
}
