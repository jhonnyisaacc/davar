/**
 * Display verse IDs are also used as navigation state and FlatList keys.
 * Keep them independent from source-specific verse identifiers, which may be
 * local to a chapter (for example, the Greek release uses `"1"`).
 */
export const toDisplayVerseId = (
  bookId: string,
  chapter: number,
  verse: number,
): string => `${bookId}-${chapter}-${verse}`;
