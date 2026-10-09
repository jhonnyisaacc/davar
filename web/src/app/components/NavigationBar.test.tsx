import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NavigationBar } from "./NavigationBar";

const props = {
	activeDestination: "verse",
	onDestinationClick: () => {},
	settingsOpen: false,
	onSettingsOpenChange: () => {},
	book: "Genesis",
	bookDisplayName: "Genesis",
	bookHebrew: "בראשית",
	chapter: 1,
	verse: 1,
	books: [{ name: "Genesis", hebrew: "בראשית", spanish: "Génesis" }],
	chapterCount: 50,
	verseCount: 31,
	onBookChange: () => {},
	onChapterChange: () => {},
	onVerseChange: () => {},
	theme: "light",
	onThemeChange: () => {},
	language: "en",
	onLanguageChange: () => {},
	besorahLanguage: "hebrew",
	onBesorahLanguageChange: () => {},
	greekAvailable: false,
	besorahTextVersion: "delitzsch",
	onBesorahTextVersionChange: () => {},
	showQumran: false,
	onQumranChange: () => {},
	showFullChapter: false,
	onFullChapterChange: () => {},
	seferMode: false,
	onSeferModeChange: () => {},
	hebrewOnly: false,
	onHebrewOnlyChange: () => {},
	showNikud: false,
	onNikudChange: () => {},
	showCantillation: false,
	onCantillationChange: () => {},
	translationOnly: false,
	onTranslationOnlyChange: () => {},
} as const;

test("book trigger is wired to the book selector panel", () => {
	const html = renderToStaticMarkup(<NavigationBar {...props} />);
	expect(html).toContain('aria-controls="navigation-book-selector"');
	expect(html).not.toContain("Search book");
});
