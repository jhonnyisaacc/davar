import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { useState } from "react";
import { useReadingModes } from "./useReadingModes";
import { useScreenNavigation } from "./useScreenNavigation";

const dom = new Window({ url: "http://localhost:5300/genesis/1/6" });
for (const key of [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"MutationObserver",
]) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		writable: true,
		value: key === "window" ? dom : Reflect.get(dom, key),
	});
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
	configurable: true,
	writable: true,
	value: true,
});
const { act, cleanup, renderHook } = await import("@testing-library/react");
afterEach(cleanup);

function useReader() {
	const [showFullChapter, setShowFullChapter] = useState(false);
	const [seferMode, setSeferMode] = useState(false);
	const [translationOnly, setTranslationOnly] = useState(false);
	const [hebrewOnly, setHebrewOnly] = useState(false);
	const [showQumran, setShowQumran] = useState(true);
	const [showNikud, setShowNikud] = useState(true);
	const [showCantillation, setShowCantillation] = useState(true);
	const [currentChapter, setCurrentChapter] = useState(1);
	const [currentVerse, setCurrentVerse] = useState(6);
	const modes = useReadingModes({
		showFullChapter,
		seferMode,
		translationOnly,
		hebrewOnly,
		showQumran,
		showNikud,
		showCantillation,
		setShowFullChapter,
		setSeferMode,
		setTranslationOnly,
		setHebrewOnly,
		setShowQumran,
		setShowNikud,
		setShowCantillation,
		currentVerse,
		setCurrentChapter,
		setCurrentVerse,
		chapterVerses: [{ verse: 6, sourceChapter: 2, sourceVerse: 1 }],
	});
	return {
		...modes,
		showFullChapter,
		seferMode,
		translationOnly,
		hebrewOnly,
		showQumran,
		showNikud,
		showCantillation,
		currentChapter,
		currentVerse,
		setShowFullChapter,
	};
}

test("Sefer selects translation and leaving translation returns to the source verse", () => {
	const { result } = renderHook(useReader);
	act(() => result.current.handleSeferModeChange(true));
	expect(result.current.showFullChapter).toBe(true);
	expect(result.current.seferMode).toBe(true);
	expect(result.current.translationOnly).toBe(true);
	expect([
		result.current.hebrewOnly,
		result.current.showQumran,
		result.current.showNikud,
		result.current.showCantillation,
	]).toEqual([false, false, false, false]);
	act(() => result.current.handleTranslationOnlyChange(false));
	expect([result.current.currentChapter, result.current.currentVerse]).toEqual([
		2, 1,
	]);
	expect([
		result.current.seferMode,
		result.current.showFullChapter,
		result.current.showQumran,
		result.current.showNikud,
	]).toEqual([false, false, true, true]);
});

test("Hebrew Sefer keeps its text mode and exits when full chapter or Hebrew is disabled", () => {
	const { result } = renderHook(useReader);
	act(() => result.current.handleHebrewOnlyChange(true));
	act(() => result.current.handleSeferModeChange(true));
	expect(result.current.translationOnly).toBe(false);
	expect(result.current.showQumran).toBe(true);
	act(() => result.current.setShowFullChapter(false));
	expect(result.current.seferMode).toBe(false);
	act(() => result.current.handleSeferModeChange(true));
	act(() => result.current.handleHebrewOnlyChange(false));
	expect(result.current.seferMode).toBe(false);
});

test("settings remain an overlay over the current screen and direct settings URLs retain the reader", () => {
	dom.history.replaceState(null, "", "/settings");
	const { result } = renderHook(useScreenNavigation);
	expect(result.current.currentScreen).toBe("verse");
	expect(result.current.settingsOpen).toBe(true);
	act(() => result.current.handleOpenScreen("assemblies"));
	act(() => result.current.handleOpenScreen("settings"));
	expect(result.current.currentScreen).toBe("assemblies");
	expect(result.current.settingsOpen).toBe(true);
	act(() => result.current.setSettingsOpen(false));
	expect(result.current.currentScreen).toBe("assemblies");
});
