import { expect, test } from "bun:test";
import {
	nextNavHidden,
	readerNavPresence,
	readerNavTracksScroll,
} from "./useReaderChrome";

test("full chapter tracks scroll at every width, and desktop single-verse does not", () => {
	expect(
		readerNavTracksScroll({
			isMobile: false,
			currentScreen: "verse",
			showFullChapter: true,
		}),
	).toBe(true);
	expect(
		readerNavTracksScroll({
			isMobile: true,
			currentScreen: "verse",
			showFullChapter: true,
		}),
	).toBe(true);
	expect(
		readerNavTracksScroll({
			isMobile: false,
			currentScreen: "verse",
			showFullChapter: false,
		}),
	).toBe(false);
	expect(
		readerNavTracksScroll({
			isMobile: false,
			currentScreen: "widgets",
			showFullChapter: true,
		}),
	).toBe(false);
	expect(
		readerNavTracksScroll({
			isMobile: true,
			currentScreen: "widgets",
			showFullChapter: false,
		}),
	).toBe(true);
});

test("scroll down hides the bar and scroll up shows it, including near the top", () => {
	expect(nextNavHidden(80, 0)).toBe(true);
	expect(nextNavHidden(40, 80)).toBe(false);
	expect(nextNavHidden(30, 28)).toBe(null);
	expect(nextNavHidden(10, 80)).toBe(false);
});

const narrowSingleVerse = {
	isMobile: true,
	currentScreen: "verse" as const,
	showFullChapter: false,
	canHover: true,
	pointerOver: false,
	focusWithin: false,
	menuOpen: false,
	scrollHidden: false,
};

test("narrow single verse with a mouse shows the bar only while the pointer, keyboard focus, or a menu holds it", () => {
	expect(readerNavPresence(narrowSingleVerse)).toBe("awaitingHover");
	expect(readerNavPresence({ ...narrowSingleVerse, pointerOver: true })).toBe(
		"shown",
	);
	expect(readerNavPresence({ ...narrowSingleVerse, focusWithin: true })).toBe(
		"shown",
	);
	expect(readerNavPresence({ ...narrowSingleVerse, menuOpen: true })).toBe(
		"shown",
	);
	expect(readerNavPresence({ ...narrowSingleVerse, scrollHidden: true })).toBe(
		"awaitingHover",
	);
});

test("touch devices, wide windows, and full chapter keep the scroll-driven bar", () => {
	const touch = { ...narrowSingleVerse, canHover: false };
	expect(readerNavPresence(touch)).toBe("shown");
	expect(readerNavPresence({ ...touch, scrollHidden: true })).toBe(
		"hiddenByScroll",
	);
	expect(readerNavPresence({ ...narrowSingleVerse, isMobile: false })).toBe(
		"shown",
	);
	expect(
		readerNavPresence({
			...narrowSingleVerse,
			showFullChapter: true,
			scrollHidden: true,
		}),
	).toBe("hiddenByScroll");
	expect(
		readerNavPresence({ ...narrowSingleVerse, currentScreen: "widgets" }),
	).toBe("shown");
});
