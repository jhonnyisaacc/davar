// eslint-disable-next-line import/no-unresolved
import { expect, test } from "bun:test";
import {
  getNavigationDockBottomInset,
  getNavigationDockContentPadding,
  NAVIGATION_DOCK_HEIGHT,
} from "../constants/navigationDock";
import { getVerseSwipeDirection } from "./versePaging";

test("a long verse's final line clears the floating dock at its scroll limit", () => {
  // Model the overflowing Hebrew and translation in Sofonias 2:15 without
  // embedding licensed text. Native layout supplies the actual text height.
  const textBottom = 1200;
  for (const bottomInset of [0, 34]) {
    for (const viewportHeight of [560, 820]) {
      const bottomPadding = getNavigationDockContentPadding(bottomInset) + 32;
      const maxOffsetY = textBottom + bottomPadding - viewportHeight;
      const dockTop =
        viewportHeight -
        NAVIGATION_DOCK_HEIGHT -
        getNavigationDockBottomInset(bottomInset);
      expect(dockTop - (textBottom - maxOffsetY)).toBe(44);

      // Even a fast drag that reveals the final line must stay on this verse.
      expect(
        getVerseSwipeDirection({
          startOffsetY: 0,
          offsetY: maxOffsetY,
          maxOffsetY,
          velocityY: -1500,
        }),
      ).toBeNull();
      expect(
        getVerseSwipeDirection({
          startOffsetY: maxOffsetY,
          offsetY: maxOffsetY,
          maxOffsetY,
          velocityY: -1500,
        }),
      ).toBe("next");
    }
  }
});

test("reaching the top of a long verse also requires a new swipe to page back", () => {
  expect(
    getVerseSwipeDirection({
      startOffsetY: 300,
      offsetY: 0,
      maxOffsetY: 300,
      velocityY: 1200,
    }),
  ).toBeNull();
  expect(
    getVerseSwipeDirection({
      startOffsetY: 0,
      offsetY: 0,
      maxOffsetY: 300,
      velocityY: 1200,
    }),
  ).toBe("previous");
});

test("scrolling away from an edge never changes verses", () => {
  for (const swipe of [
    { startOffsetY: 300, offsetY: 100, velocityY: 1200 },
    { startOffsetY: 0, offsetY: 100, velocityY: -1200 },
    { startOffsetY: 300, offsetY: 100, velocityY: -1200 },
    { startOffsetY: 0, offsetY: 100, velocityY: 1200 },
  ]) {
    expect(getVerseSwipeDirection({ ...swipe, maxOffsetY: 300 })).toBeNull();
  }
});

test("short verses retain immediate up/down swipe navigation", () => {
  const shortVerse = { startOffsetY: 0, offsetY: 0, maxOffsetY: 0 };
  expect(
    getVerseSwipeDirection({ ...shortVerse, velocityY: -1200 }),
  ).toBe("next");
  expect(getVerseSwipeDirection({ ...shortVerse, velocityY: 1200 })).toBe(
    "previous",
  );
  for (const velocityY of [-600, -200, 0, 200, 600]) {
    expect(getVerseSwipeDirection({ ...shortVerse, velocityY })).toBeNull();
  }
});

test("fractional native offsets tolerate rounding without paging early", () => {
  expect(
    getVerseSwipeDirection({
      startOffsetY: 298.5,
      offsetY: 299.8,
      maxOffsetY: 300,
      velocityY: -900,
    }),
  ).toBe("next");
  expect(
    getVerseSwipeDirection({
      startOffsetY: 297,
      offsetY: 300,
      maxOffsetY: 300,
      velocityY: -900,
    }),
  ).toBeNull();
});
