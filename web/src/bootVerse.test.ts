import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	translationColumnWidth,
	translationLineWidths,
} from "./app/components/translationLines";

const html = readFileSync(join(import.meta.dir, "..", "index.html"), "utf8");
const source = html.match(
	/<script id="davar-early-boot">([\s\S]*?)<\/script>/,
)?.[1];

if (!source) {
	throw new Error("index.html is missing the early verse boot script");
}

new Function(source)();

const readEarlyVerseTarget = (
	globalThis as typeof globalThis & {
		__davarReadEarlyVerseTarget: (
			pathname: string,
			stored: {
				book?: string;
				chapter?: number;
				verse?: number;
				translationOnly?: boolean;
				besorahTextVersion?: string;
			} | null,
		) => { path: string; verse: number } | null;
	}
).__davarReadEarlyVerseTarget;

test("a verse url points at that chapter file", () => {
	expect(readEarlyVerseTarget("/verse/Genesis/1/1", null)).toEqual({
		path: "/data/oe/genesis/1.json",
		verse: 1,
	});
});

test("the home route uses the stored position", () => {
	expect(
		readEarlyVerseTarget("/", {
			book: "Exodus",
			chapter: 2,
			verse: 3,
		}),
	).toEqual({
		path: "/data/oe/exodus/2.json",
		verse: 3,
	});
});

test("a besorah url uses the selected text", () => {
	expect(
		readEarlyVerseTarget("/verse/Matthew/5/3", {
			besorahTextVersion: "hutter",
		}),
	).toEqual({
		path: "/data/hutter/matthew/5.json",
		verse: 3,
	});
	expect(readEarlyVerseTarget("/verse/Matthew/5/3", null)).toEqual({
		path: "/data/besorah/matthew/5.json",
		verse: 3,
	});
});

test("translation-only reading and other screens stay quiet", () => {
	expect(readEarlyVerseTarget("/", { translationOnly: true })).toBeNull();
	expect(readEarlyVerseTarget("/commentary", null)).toBeNull();
});

const earlyApi = globalThis as typeof globalThis & {
	__davarEarlyDisplayWord: (
		text: string,
		stored: { showCantillation?: boolean; showNikud?: boolean } | null,
	) => string;
	__davarEarlyTranslationLines: (
		wordCount: number,
		columnWidth: number,
	) => number[];
};

test("early words sit in a block so the spaces between them remain", () => {
	const rule = html.match(/\.early-verse\s*\{[^}]*\}/)?.[0] ?? "";
	expect(rule).toContain("display: block");
	expect(rule).toContain("word-spacing: 0.24em");
});

test("early words match the settled verse, without cantillation or slash marks", () => {
	expect(
		earlyApi.__davarEarlyDisplayWord("בְּ/רֵאשִׁ֖ית", {
			showCantillation: false,
		}),
	).toBe("בְּרֵאשִׁית");
});

test("the translation skeleton is one bar per line", () => {
	const wide = earlyApi.__davarEarlyTranslationLines(7, 864);
	expect(wide).toHaveLength(1);
	expect(wide[0]).toBeGreaterThan(200);
	expect(wide[0]).toBeLessThan(864);
	const narrow = earlyApi.__davarEarlyTranslationLines(7, 310);
	expect(narrow.length).toBeGreaterThan(1);
	expect(narrow[0]).toBe(310);
	expect(narrow[narrow.length - 1]).toBeGreaterThan(0);
	expect(narrow[narrow.length - 1]).toBeLessThan(310);
});

test("react translation bars use the early line rule", () => {
	expect(translationColumnWidth(390)).toBe(310);
	expect(translationColumnWidth(1280)).toBe(864);
	for (const [wordCount, columnWidth] of [
		[7, 864],
		[7, 310],
		[400, 320],
		[0, 864],
	] as const) {
		expect(translationLineWidths(wordCount, columnWidth)).toEqual(
			earlyApi.__davarEarlyTranslationLines(wordCount, columnWidth),
		);
	}
});
