import { AccountScreen } from "./components/AccountScreen";
import { SourcesScreen } from "./components/SourcesScreen";
import { CommentarySourcesScreen } from "./components/CommentarySourcesScreen";
import { SupportScreen } from "./components/SupportScreen";
import { DonationPage } from "./components/DonationPage";
import type { CommentaryContext } from "@davar/shared/productContracts";
import { CalendarPanel } from "./features/calendar/CalendarPanel";
import { ProductScreen } from "./components/ProductScreen";
import type { ReactNode } from "react";
import type { BesorahLanguage } from "@davar/shared/greekBesorah";
import { ConnectionErrorPage } from "./components/ConnectionErrorPage";
import { FeaturesScreen } from "./components/FeaturesScreen";
import { FeedbackScreen } from "./components/FeedbackScreen";
import { HomeScreen } from "./components/HomeScreen";
import { LegalScreen } from "./components/LegalScreen";
import { NotFoundPage } from "./components/NotFoundPage";
import { SettingsScreen } from "./components/SettingsScreen";
import type { RouteScreen } from "./utils/routeState";

type NonVerseScreen = Exclude<RouteScreen, "verse">;

export type NonVerseScreenProps = {
	commentaryContext?: CommentaryContext | null;
	screen: NonVerseScreen;
	language: "en" | "es" | "he";
	theme: "light" | "dark";
	onThemeChange: (theme: "light" | "dark") => void;
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
	translationOnly: boolean;
	onTranslationOnlyChange: (show: boolean) => void;
	onOpenScreen: (screen: RouteScreen) => void;
	onOpenDesignSystem: () => void;
	onOpenMobileDesignGuide: () => void;
};

export function renderNonVerseScreen({
	commentaryContext,
	screen,
	language,
	theme,
	onThemeChange,
	onLanguageChange,
	besorahLanguage,
	onBesorahLanguageChange,
	greekAvailable,
	besorahTextVersion,
	onBesorahTextVersionChange,
	showQumran,
	onQumranChange,
	showFullChapter,
	onFullChapterChange,
	showCalendarDayPill = false,
	onCalendarDayPillChange,
	seferMode,
	onSeferModeChange,
	hebrewOnly,
	onHebrewOnlyChange,
	translationOnly,
	onTranslationOnlyChange,
	onOpenScreen,
	onOpenDesignSystem,
	onOpenMobileDesignGuide,
}: NonVerseScreenProps): ReactNode {
	const settingsProps = {
		theme,
		onThemeChange,
		language,
		onLanguageChange,
		besorahLanguage,
		onBesorahLanguageChange,
		greekAvailable,
		besorahTextVersion,
		onBesorahTextVersionChange,
		showQumran,
		onQumranChange,
		showFullChapter,
		onFullChapterChange,
		showCalendarDayPill,
		onCalendarDayPillChange,
		seferMode,
		onSeferModeChange,
		hebrewOnly,
		onHebrewOnlyChange,
		translationOnly,
		onTranslationOnlyChange,
	};
	switch (screen) {
		case "widgets":
			return <CalendarPanel language={language} />;
		case "assemblies":
		case "commentary":
			return (
				<ProductScreen
					screen={screen}
					language={language}
					context={commentaryContext}
				/>
			);
		case "home":
			return (
				<HomeScreen
					language={language}
					onFeaturesClick={() => onOpenScreen("features")}
					onDonateClick={() => onOpenScreen("donate")}
				/>
			);
		case "terms":
			return (
				<LegalScreen
					kind="terms"
					language={language}
					onBack={() => onOpenScreen("settings")}
				/>
			);
		case "privacy":
			return (
				<LegalScreen
					kind="privacy"
					language={language}
					onBack={() => onOpenScreen("settings")}
				/>
			);
		case "feedback":
			return (
				<FeedbackScreen
					language={language}
					onBack={() => onOpenScreen("home")}
				/>
			);
		case "donate":
			return (
				<DonationPage
					language={language}
					onBack={() => onOpenScreen("settings")}
				/>
			);
		case "features":
			return <FeaturesScreen language={language} />;
		case "sources":
			return (
				<SourcesScreen
					language={language}
					onBack={() => onOpenScreen("settings")}
				/>
			);
		case "commentarySources":
			return (
				<CommentarySourcesScreen
					language={language}
					onBack={() => onOpenScreen("settings")}
				/>
			);
		case "support":
			return (
				<SupportScreen
					language={language}
					onBack={() => onOpenScreen("settings")}
				/>
			);
		case "account":
			return (
				<AccountScreen
					{...settingsProps}
					onBack={() => onOpenScreen("settings")}
				/>
			);
		case "settings":
			return (
				<SettingsScreen
					{...settingsProps}
					onAccountClick={() => onOpenScreen("account")}
					onOpenScreen={onOpenScreen}
					onDesignSystemClick={onOpenDesignSystem}
					onMobileDesignGuideClick={onOpenMobileDesignGuide}
				/>
			);
		case "notFound":
			return (
				<NotFoundPage
					language={language}
					onGoBack={() => onOpenScreen("verse")}
				/>
			);
		case "connectionError":
			return <ConnectionErrorPage onRetry={() => window.location.reload()} />;
	}
}
