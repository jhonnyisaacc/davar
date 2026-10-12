import { expect, test } from "bun:test";
import { visibleChapter } from "./visibleChapter";

const published = [{ verse: 1 }];
const peeked = [{ verse: 2 }];
const source = [{ verse: 3 }];

test("a published chapter stays on screen with its own translation state", () => {
	expect(
		visibleChapter({
			publishedIdentity: "genesis:1:source:delitzsch",
			chapterIdentity: "genesis:1:source:delitzsch",
			publishedVerses: published,
			publishedTranslationPending: true,
			publishedLoading: false,
			peekedFull: peeked,
			peekedSource: source,
			translationExpected: true,
			hasBook: true,
		}),
	).toEqual({
		verses: published,
		translationPending: true,
		loading: false,
	});
});

test("a cached chapter replaces the previous one immediately", () => {
	expect(
		visibleChapter({
			publishedIdentity: "genesis:1:source:delitzsch",
			chapterIdentity: "genesis:2:source:delitzsch",
			publishedVerses: published,
			publishedTranslationPending: false,
			publishedLoading: false,
			peekedFull: peeked,
			peekedSource: source,
			translationExpected: true,
			hasBook: true,
		}),
	).toEqual({
		verses: peeked,
		translationPending: false,
		loading: false,
	});
});

test("a cached source keeps line bars until its translation is stored", () => {
	const visible = visibleChapter({
		publishedIdentity: "genesis:1:source:delitzsch",
		chapterIdentity: "exodus:1:source:delitzsch",
		publishedVerses: published,
		publishedTranslationPending: false,
		publishedLoading: false,
		peekedFull: null,
		peekedSource: source,
		translationExpected: true,
		hasBook: true,
	});
	expect(visible.verses).toBe(source);
	expect(visible.translationPending).toBe(true);
	expect(visible.loading).toBe(false);
});

test("a chapter that is not cached yet does not keep the previous verse", () => {
	const visible = visibleChapter({
		publishedIdentity: "genesis:1:source:delitzsch",
		chapterIdentity: "revelation:22:source:delitzsch",
		publishedVerses: published,
		publishedTranslationPending: false,
		publishedLoading: false,
		peekedFull: null,
		peekedSource: null,
		translationExpected: true,
		hasBook: true,
	});
	expect(visible.verses).toEqual([]);
	expect(visible.loading).toBe(true);
	expect(visible.translationPending).toBe(false);
});
