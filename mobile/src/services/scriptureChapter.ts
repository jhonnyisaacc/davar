import type { BesorahTextVersion } from "@davar/shared/translationConfig";
import { applyChapterTranslations } from "./scriptureDisplay";
import type { DisplayVerse, ReferenceMode } from "./scriptureDisplay";
import { loadStaticTranslationsForChapter } from "./scriptureStaticLoad";
import { type OfflineChapter, readOfflineChapter } from "./scriptureSqlite";
import { fetchChapterVersesStatic } from "./scriptureStatic";

type ChapterReadOptions = {
  language?: "en" | "es";
  showDss?: boolean;
  hebrewOnly?: boolean;
  isConnected?: boolean;
  referenceMode?: ReferenceMode;
  besorahTextVersion?: BesorahTextVersion;
};

export type ChapterSourcePaint = {
  verses: DisplayVerse[];
  translationPending: boolean;
};

const readStoredChapter = async (
  bookId: string,
  chapter: number,
  options?: ChapterReadOptions,
): Promise<OfflineChapter | null> => {
  try {
    return await readOfflineChapter(bookId, chapter, options);
  } catch (offlineError) {
    if (options?.isConnected === false) {
      throw offlineError;
    }
    return null;
  }
};

const offlineCoversRequest = (
  offline: OfflineChapter,
  options?: ChapterReadOptions,
): boolean => {
  const needsTranslation = Boolean(options?.language) && !options?.hebrewOnly;
  return (!needsTranslation || offline.translationStored) && offline.dssReady;
};

const attachStoredChapterTranslation = async (
  bookId: string,
  offline: OfflineChapter,
  language: "en" | "es",
): Promise<DisplayVerse[]> => {
  const loaded = await loadStaticTranslationsForChapter(
    bookId,
    offline.verses.map((verse) => ({
      chapter: verse.sourceChapter,
      verse: verse.sourceVerse,
    })),
    language,
    false,
  );
  return applyChapterTranslations(bookId, offline.verses, language, loaded);
};

export const fetchChapterVerses = async (
  bookId: string,
  chapter: number,
  options?: ChapterReadOptions,
): Promise<DisplayVerse[]> => {
  const offline = await readStoredChapter(bookId, chapter, options);

  if (options?.isConnected === false) {
    if (!offline) {
      throw new Error(
        `No offline Hebrew data for ${bookId} chapter ${chapter}`,
      );
    }
    return offline.verses;
  }

  if (offline && offlineCoversRequest(offline, options)) {
    return offline.verses;
  }

  const language = options?.language;
  if (offline && language && !options?.hebrewOnly && offline.dssReady) {
    try {
      return await attachStoredChapterTranslation(bookId, offline, language);
    } catch (translationError) {
      console.debug(
        `Stored chapter ${bookId}/${chapter} is missing its translation file:`,
        translationError,
      );
    }
  }

  try {
    return await fetchChapterVersesStatic(bookId, chapter, options);
  } catch (staticError) {
    if (offline) {
      return offline.verses;
    }
    const staticMessage =
      staticError instanceof Error ? staticError.message : String(staticError);
    throw new Error(
      `${staticMessage} | Offline fallback failed: No offline Hebrew data for ${bookId} chapter ${chapter}`,
    );
  }
};

const wantsSourceFirst = (
  options?: ChapterReadOptions,
): options is ChapterReadOptions & { language: "en" | "es" } =>
  options?.isConnected !== false &&
  options?.referenceMode !== "translation" &&
  !options?.hebrewOnly &&
  (options?.language === "en" || options?.language === "es");

export const readChapterSourceFirst = (
  bookId: string,
  chapter: number,
  options?: ChapterReadOptions,
): {
  source: Promise<ChapterSourcePaint>;
  settled: Promise<DisplayVerse[]>;
} => {
  if (!wantsSourceFirst(options)) {
    const settled = fetchChapterVerses(bookId, chapter, options);
    const source = settled.then((verses) => ({
      verses,
      translationPending: false,
    }));
    void source.catch(() => undefined);
    return { source, settled };
  }

  let resolveSettled!: (verses: DisplayVerse[]) => void;
  let rejectSettled!: (error: unknown) => void;
  const settled = new Promise<DisplayVerse[]>((resolve, reject) => {
    resolveSettled = resolve;
    rejectSettled = reject;
  });

  // Hebrew is enough to paint. The translation file must not hold the verse back.
  const source = (async (): Promise<ChapterSourcePaint> => {
    let settledHooked = false;
    try {
      const offline = await readOfflineChapter(bookId, chapter, options).catch(
        () => null,
      );
      if (offline && offlineCoversRequest(offline, options)) {
        resolveSettled(offline.verses);
        return { verses: offline.verses, translationPending: false };
      }

      const settledLoad = fetchChapterVerses(bookId, chapter, options);
      void settledLoad.then(resolveSettled, rejectSettled);
      settledHooked = true;

      if (offline) {
        return {
          verses: offline.verses,
          translationPending: !offline.translationStored,
        };
      }

      const verses = await fetchChapterVerses(bookId, chapter, {
        ...options,
        hebrewOnly: true,
        language: undefined,
        showDss: false,
      });
      return { verses, translationPending: true };
    } catch (error) {
      if (!settledHooked) {
        rejectSettled(error);
      }
      throw error;
    }
  })();

  return { source, settled };
};
