type VerseNumberOptions = {
  bookId: string;
  chapter: number;
  currentBookId: string;
  currentChapter: number;
  translationOnly: boolean;
  currentChapterVerseNumbers?: number[];
  verseCounts: Record<string, Record<string, number>>;
};

/** Preserve translation reference gaps when selecting within the loaded chapter. */
export function getNavigationVerseNumbers({
  bookId,
  chapter,
  currentBookId,
  currentChapter,
  translationOnly,
  currentChapterVerseNumbers,
  verseCounts,
}: VerseNumberOptions): number[] {
  if (
    translationOnly &&
    bookId === currentBookId &&
    chapter === currentChapter &&
    currentChapterVerseNumbers?.length
  ) {
    return Array.from(
      new Set(
        currentChapterVerseNumbers.filter(
          (value) => Number.isInteger(value) && value > 0,
        ),
      ),
    ).sort((a, b) => a - b);
  }

  const count = verseCounts[bookId]?.[String(chapter)] ?? 0;
  return Array.from({ length: count }, (_, index) => index + 1);
}
