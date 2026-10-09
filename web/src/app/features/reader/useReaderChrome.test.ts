import { expect, test } from "bun:test";
import { nextNavHidden, readerNavTracksScroll } from "./useReaderChrome";

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
