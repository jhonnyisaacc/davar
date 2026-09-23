import type { ReactNode } from "react";
import type { BesorahLanguage } from "@davar/shared/greekBesorah";
import { ConnectionErrorPage } from "./components/ConnectionErrorPage";
import { DonateScreen } from "./components/DonateScreen";
import { FeaturesScreen } from "./components/FeaturesScreen";
import { FeedbackScreen } from "./components/FeedbackScreen";
import { HomeScreen } from "./components/HomeScreen";
import { LegalScreen } from "./components/LegalScreen";
import { NotFoundPage } from "./components/NotFoundPage";
import { SettingsScreen } from "./components/SettingsScreen";
import type { RouteScreen } from "./utils/routeState";

type NonVerseScreen = Exclude<RouteScreen, "verse">;

export type NonVerseScreenProps = {
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
	seferMode: boolean;
	onSeferModeChange: (show: boolean) => void;
	hebrewOnly: boolean;
	onHebrewOnlyChange: (show: boolean) => void;
	onOpenScreen: (screen: RouteScreen) => void;
	onOpenDesignSystem: () => void;
	onOpenMobileDesignGuide: () => void;
};

export function renderNonVerseScreen({
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
	seferMode,
	onSeferModeChange,
	hebrewOnly,
	onHebrewOnlyChange,
	onOpenScreen,
	onOpenDesignSystem,
	onOpenMobileDesignGuide,
}: NonVerseScreenProps): ReactNode {
	switch (screen) {
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
					onBack={() => onOpenScreen("home")}
				/>
			);
		case "privacy":
			return (
				<LegalScreen
					kind="privacy"
					language={language}
					onBack={() => onOpenScreen("home")}
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
			return <DonateScreen language={language} />;
		case "features":
			return <FeaturesScreen language={language} />;
		case "settings":
			return (
				<SettingsScreen
					theme={theme}
					onThemeChange={onThemeChange}
					language={language}
					onLanguageChange={onLanguageChange}
					besorahLanguage={besorahLanguage}
					onBesorahLanguageChange={onBesorahLanguageChange}
					greekAvailable={greekAvailable}
					besorahTextVersion={besorahTextVersion}
					onBesorahTextVersionChange={onBesorahTextVersionChange}
					showQumran={showQumran}
					onQumranChange={onQumranChange}
					showFullChapter={showFullChapter}
					onFullChapterChange={onFullChapterChange}
					seferMode={seferMode}
					onSeferModeChange={onSeferModeChange}
					hebrewOnly={hebrewOnly}
					onHebrewOnlyChange={onHebrewOnlyChange}
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
			return (
				<ConnectionErrorPage onRetry={() => window.location.reload()} />
			);
	}
}
