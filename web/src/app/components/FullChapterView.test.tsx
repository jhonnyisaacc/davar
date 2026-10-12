import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { translate } from "../hooks/useTranslation";
import type { VerseResponse } from "../services/verseService";
import { FullChapterView } from "./FullChapterView";
import { VerseDisplay } from "./VerseDisplay";

const verse: VerseResponse = {
	chapter: 1,
	verse: 7,
	sourceChapter: 1,
	sourceVerse: 7,
	hebrew: "בָּרָ֣א אֱלֹהִים",
	words: [
		{
			position: 0,
			text: "בָּרָ֣א",
			strong: "H1254",
			prefixes: [],
			has_dss_variant: true,
		},
		{
			position: 1,
			text: "אֱלֹהִים",
			strong: "H430",
			prefixes: [],
			has_dss_variant: false,
		},
	],
	translation: "Mock English text¹",
	translation_language: "en",
	dss: [{ position: 0, masoretic_word: "בָּרָ֣א", dss_word: "עשה" }],
};
const baseProps = {
	verses: [verse],
	bookName: "Genesis",
	bookNameHebrew: "בראשית",
	chapter: 1,
	language: "en" as const,
	hebrewOnly: false,
	onWordClick: () => {},
};

describe("chapter display options", () => {
	for (const language of ["en", "es", "he"] as const) {
		for (const seferMode of [false, true]) {
			test(`${language}, Sefer ${seferMode}: Hebrew, Qumran, Nikud and cantillation retain text`, () => {
				for (const showQumran of [false, true]) {
					for (const showNikud of [false, true]) {
						for (const showCantillation of [false, true]) {
							const html = renderToStaticMarkup(
								<FullChapterView
									{...baseProps}
									language={language}
									seferMode={seferMode}
									hebrewOnly
									showQumran={showQumran}
									showNikud={showNikud}
									showCantillation={showCantillation}
								/>,
							);
							expect(html).toContain("[7]");
							expect(html).toContain(showNikud ? "אֱלֹהִים" : "אלהים");
							expect(html).not.toContain("Mock English text");
							if (showQumran) {
								expect(html).toContain("עשה");
								expect(html).not.toContain("בָּרָ");
							} else {
								const expectedWord = showNikud
									? showCantillation
										? "בָּרָ֣א"
										: "בָּרָא"
									: showCantillation
										? "בר֣א"
										: "ברא";
								expect(html).toContain(expectedWord);
								expect(html.includes("֣")).toBe(showCantillation);
							}
						}
					}
				}
			});
			test(`${language}, Sefer ${seferMode}: translation-only shows text and real verse numbers`, () => {
				const html = renderToStaticMarkup(
					<FullChapterView
						{...baseProps}
						language={language}
						seferMode={seferMode}
						translationOnly
					/>,
				);
				expect(html).toContain("Mock English text");
				expect(html).toContain("[7]");
				expect(html).not.toContain("אֱלֹהִים");
				expect(html).not.toContain("<sup");
			});
			test(`${language}, Sefer ${seferMode}: unavailable translation is never just brackets`, () => {
				const html = renderToStaticMarkup(
					<FullChapterView
						{...baseProps}
						language={language}
						verses={[{ ...verse, translation: "" }]}
						seferMode={seferMode}
						translationOnly
					/>,
				);
				expect(html).toContain(
					translate(
						language,
						language === "es"
							? "verse.missingSpanishTranslation"
							: "verse.translationUnavailable",
					),
				);
			});
		}
	}
	test("bilingual chapters retain both texts and Spanish footnotes", () => {
		const html = renderToStaticMarkup(
			<FullChapterView
				{...baseProps}
				language="es"
				verses={[
					{
						...verse,
						translation: "Texto de prueba [a]",
						translation_language: "es",
						translation_footnotes: [
							{ marker: "a", number: "1", word: "prueba", explanation: "Note" },
						],
					},
				]}
			/>,
		);
		expect(html).toContain("אֱלֹהִים");
		expect(html).toContain("Texto de prueba");
		expect(html).toContain("<sup");
	});
	test("Greek source remains readable and Hebrew overlay is RTL", () => {
		const greekVerse: VerseResponse = {
			...verse,
			source_language: "greek",
			text: "λόγος",
			hebrew: "",
			words: [
				{
					position: 0,
					text: "λόγος",
					strong: "G3056",
					prefixes: [],
					has_dss_variant: false,
				},
			],
			translation: "דבר",
			translation_language: "he",
		};
		const html = renderToStaticMarkup(
			<FullChapterView {...baseProps} verses={[greekVerse]} language="he" />,
		);
		expect(html).toContain("λόγος");
		expect(html).toContain("דבר");
		expect(html).toContain("direction:rtl");
		const sefer = renderToStaticMarkup(
			<FullChapterView
				{...baseProps}
				verses={[greekVerse]}
				hebrewOnly
				seferMode
			/>,
		);
		expect(sefer).toContain("λόγος");
		expect(sefer).toContain("direction:ltr");
	});
	test("single verse also reports a missing translation", () => {
		const html = renderToStaticMarkup(
			<VerseDisplay
				hebrewText={verse.hebrew}
				translation=""
				verseRef="Genesis 1:7"
				verseNumber={7}
				bookName="Genesis"
				bookNameHebrew="בראשית"
				book="Genesis"
				chapter={1}
				language="en"
				words={verse.words}
				onWordClick={() => {}}
			/>,
		);
		expect(html).toContain(translate("en", "verse.translationUnavailable"));
	});
});
