// Bun supplies this runtime module; Expo lint does not resolve it.
// eslint-disable-next-line import/no-unresolved
import { expect, test } from "bun:test";
import { getNavigationVerseNumbers } from "./navigationSelection";

const currentLocation = {
  currentBookId: "genesis",
  currentChapter: 1,
  translationOnly: false,
  verseCounts: {
    genesis: { "1": 31, "2": 25 },
    jude: { "1": 25 },
  },
};

test("verse choices are scoped to the selected book and chapter", () => {
  const firstChapter = getNavigationVerseNumbers({
    ...currentLocation,
    bookId: "genesis",
    chapter: 1,
  });
  expect(firstChapter).toHaveLength(31);
  expect(firstChapter[0]).toBe(1);
  expect(firstChapter.at(-1)).toBe(31);
  expect(
    getNavigationVerseNumbers({
      ...currentLocation,
      bookId: "genesis",
      chapter: 2,
    }),
  ).toHaveLength(25);
  expect(
    getNavigationVerseNumbers({
      ...currentLocation,
      bookId: "jude",
      chapter: 1,
    }),
  ).toHaveLength(25);
  expect(
    getNavigationVerseNumbers({
      ...currentLocation,
      bookId: "jude",
      chapter: 2,
    }),
  ).toEqual([]);
  expect(
    getNavigationVerseNumbers({
      ...currentLocation,
      bookId: "missing",
      chapter: 1,
    }),
  ).toEqual([]);
});

test("translation choices retain gaps and reject invalid reference numbers", () => {
  expect(
    getNavigationVerseNumbers({
      ...currentLocation,
      bookId: "genesis",
      chapter: 1,
      translationOnly: true,
      currentChapterVerseNumbers: [4, 1, 4, 9, 0, -1, NaN, Infinity, 1.5],
    }),
  ).toEqual([1, 4, 9]);
});

test("loaded translation references do not leak to another book or chapter", () => {
  const translationLocation = {
    ...currentLocation,
    translationOnly: true,
    currentChapterVerseNumbers: [1, 4, 9],
  };
  expect(
    getNavigationVerseNumbers({
      ...translationLocation,
      bookId: "genesis",
      chapter: 2,
    }),
  ).toHaveLength(25);
  expect(
    getNavigationVerseNumbers({
      ...translationLocation,
      bookId: "jude",
      chapter: 1,
    }),
  ).toHaveLength(25);
  expect(
    getNavigationVerseNumbers({
      ...translationLocation,
      bookId: "genesis",
      chapter: 1,
      translationOnly: false,
    }),
  ).toHaveLength(31);
  expect(
    getNavigationVerseNumbers({
      ...translationLocation,
      bookId: "genesis",
      chapter: 1,
      currentChapterVerseNumbers: [],
    }),
  ).toHaveLength(31);
});
