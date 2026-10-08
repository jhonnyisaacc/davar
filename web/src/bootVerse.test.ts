import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
