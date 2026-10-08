import {
  GREEK_RECORDED_REVISION,
  greekChapterPath,
  greekSourceIdentity,
  isGreekBesorahEnabled as isGreekBesorahFlagEnabled,
} from "@davar/shared/greekBesorah";
import { cleanGreekSurfaceText } from "@davar/shared/greekText";
import { joinHebrewPrefixSlashes } from "@davar/shared/hebrewText";
import { staticDataRequest } from "@/src/services/api";
import {
  fetchSourceVerses,
  getActiveSourceRevision,
} from "@/src/services/database";
import { toDisplayVerseId } from "@/src/services/verseIdentity";
import { fetchChapterVerses } from "./scriptureChapter";
import {
  type DisplayVerse,
  type DisplayWord,
  formatBookName,
} from "./scriptureDisplay";

type GreekChapterPayload = {
  book: string;
  chapter: number;
  complete: boolean;
  edition: "sblgnt";
  revision: string;
  source_language: "greek";
  verses: Array<{
    chapter: number;
    verse: number | null;
    verse_id: string;
    text: string;
    words: DisplayWord[];
  }>;
};

export const isGreekBesorahEnabled = (): boolean =>
  isGreekBesorahFlagEnabled({
    EXPO_PUBLIC_GREEK_PREVIEW_ENABLED:
      process.env.EXPO_PUBLIC_GREEK_PREVIEW_ENABLED,
  });

export const fetchGreekChapterVerses = async (
  bookId: string,
  chapter: number,
  options?: {
    language?: "en" | "es" | "he";
    isConnected?: boolean;
    revision?: string;
  },
): Promise<DisplayVerse[]> => {
  if (!isGreekBesorahEnabled()) return [];
  const revision = options?.revision ?? GREEK_RECORDED_REVISION;
  const identity = greekSourceIdentity(revision);
  let sourceVerses: Array<{
    chapter: number;
    verse: number;
    verseId: string;
    text: string;
    words: DisplayWord[];
  }> = [];

  if (options?.isConnected === false) {
    const active = await getActiveSourceRevision("greek", "sblgnt");
    if (active !== revision) {
      throw new Error(`Greek release ${revision} is not available offline`);
    }
    sourceVerses = (await fetchSourceVerses(identity, bookId, chapter)).map(
      (verse) => ({
        ...verse,
        words: verse.words as DisplayWord[],
      }),
    );
  } else {
    try {
      const payload = await staticDataRequest<GreekChapterPayload>(
        greekChapterPath(bookId, chapter, revision),
      );
      if (
        !payload.complete ||
        payload.revision !== revision ||
        payload.source_language !== "greek"
      ) {
        throw new Error(`Invalid Greek chapter identity: ${bookId} ${chapter}`);
      }
      sourceVerses = payload.verses
        .filter((verse) => Number.isInteger(verse.verse))
        .map((verse) => ({
          ...verse,
          verse: Number(verse.verse),
          verseId: verse.verse_id,
        }));
    } catch (onlineError) {
      const active = await getActiveSourceRevision("greek", "sblgnt");
      if (active !== revision) throw onlineError;
      sourceVerses = (await fetchSourceVerses(identity, bookId, chapter)).map(
        (verse) => ({
          ...verse,
          words: verse.words as DisplayWord[],
        }),
      );
    }
  }

  const translatedVerses =
    options?.language === "he"
      ? (
          await fetchChapterVerses(bookId, chapter, {
            isConnected: options?.isConnected,
            besorahTextVersion: "delitzsch",
          })
        ).map((verse) => ({
          ...verse,
          translation: joinHebrewPrefixSlashes(verse.hebrew),
          translation_language: "he" as const,
        }))
      : await fetchChapterVerses(bookId, chapter, {
          isConnected: options?.isConnected,
          language: options?.language,
        });
  const translations = new Map(
    translatedVerses.map((verse) => [verse.verse, verse]),
  );
  const sources = new Map(sourceVerses.map((verse) => [verse.verse, verse]));
  const verseNumbers = [
    ...new Set([...sources.keys(), ...translations.keys()]),
  ].sort((left, right) => left - right);
  return verseNumbers.map((verseNumber) => {
    const verse = sources.get(verseNumber);
    const translated = translations.get(verseNumber);
    return {
      available: Boolean(verse),
      book: formatBookName(bookId),
      bookId,
      chapter,
      edition: "sblgnt",
      hebrew: "",
      id: toDisplayVerseId(bookId, chapter, verseNumber),
      revision,
      sourceChapter: chapter,
      sourceLanguage: "greek",
      sourceVerse: verseNumber,
      text: cleanGreekSurfaceText(verse?.text ?? ""),
      translation: translated?.translation ?? "",
      translation_language: translated?.translation_language,
      translation_footnotes: translated?.translation_footnotes,
      verse: verseNumber,
      words: (verse?.words ?? []).map((word) => ({
        ...word,
        prefixes: [],
        source_language: "greek",
        text: cleanGreekSurfaceText(word.text),
      })),
    };
  });
};

export const fetchGreekVerse = async (
  bookId: string,
  chapter: number,
  verse: number,
  options?: Parameters<typeof fetchGreekChapterVerses>[2],
): Promise<DisplayVerse> => {
  const verses = await fetchGreekChapterVerses(bookId, chapter, options);
  return (
    verses.find((item) => item.verse === verse) ?? {
      available: false,
      book: formatBookName(bookId),
      bookId,
      chapter,
      edition: "sblgnt",
      hebrew: "",
      id: `${bookId}-${chapter}-${verse}-sblgnt-unavailable`,
      revision: options?.revision ?? GREEK_RECORDED_REVISION,
      sourceChapter: chapter,
      sourceLanguage: "greek",
      sourceVerse: verse,
      text: "",
      translation: "",
      verse,
      words: [],
    }
  );
};
