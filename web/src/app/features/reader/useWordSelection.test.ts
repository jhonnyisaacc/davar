import { afterEach, expect, test } from "bun:test";
import { verseRef } from "@davar/shared/contextualRelationships";
import { installTestDom } from "../../testDom";
import type { WordResponse } from "../../services/staticData";
import { useWordSelection } from "./useWordSelection";

const dom = installTestDom("http://localhost:5300/john/1/1");
Object.defineProperty(dom, "matchMedia", {
	configurable: true,
	value: () => ({
		matches: false,
		addEventListener: () => {},
		removeEventListener: () => {},
	}),
});
const { act, cleanup, renderHook } = await import("@testing-library/react");
afterEach(cleanup);

const noop = () => {};
const baseProps = {
	books: [],
	currentChapter: 1,
	currentVerse: 1,
	currentScreen: "verse",
	currentVerseData: null,
	chapterVerses: [],
	language: "es" as const,
	besorahTextVersion: "delitzsch" as const,
	setCurrentBook: noop,
	setCurrentChapter: noop,
	setCurrentVerse: noop,
};

const word = { text: "fixture", position: 1 } as WordResponse;

test("a retained selection keeps the book it was clicked in", () => {
	const { result, rerender } = renderHook(
		({ currentBook }) => useWordSelection({ ...baseProps, currentBook }),
		{ initialProps: { currentBook: "Mark" } },
	);

	act(() => result.current.handleWordClick(word, { chapter: 1, verse: 1 }));
	expect(result.current.selectedWordContext).toEqual({
		book: "Mark",
		chapter: 1,
		verse: 1,
	});

	rerender({ currentBook: "John" });

	expect(result.current.selectedWordContext).toBeNull();
	const retained = result.current.lastSelectedWordContext;
	expect(retained?.book).toBe("Mark");
	expect(
		retained && verseRef(retained.book, retained.chapter, retained.verse),
	).toEqual({ book_id: "mark", chapter: 1, verse: 1 });
});
