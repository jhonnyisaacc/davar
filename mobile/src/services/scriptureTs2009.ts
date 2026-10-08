import { staticDataRequest, ts2009Request } from "@/src/services/api";
import {
  ts2009BookAssetPath,
  ts2009BookFileName,
  ts2009BookFileStems,
} from "@davar/shared/scripturePaths";
import { ts2009ChapterAssetPath } from "@davar/shared/staticDataPaths";

// Chapter-level cache for TS2009 static JSON (matches web approach)
const ts2009ChapterCache = new Map<
  string,
  Promise<Map<number, string> | null>
>();
let ts2009ChapterFilesUnavailable = false;

type Ts2009BookVerse = {
  number?: number;
  verse?: number;
  text?: unknown;
  translation?: unknown;
};

type Ts2009BookChapter = {
  number?: number;
  chapter?: number;
  verses?: Ts2009BookVerse[];
};

type Ts2009BookPayload = {
  chapters?:
    | Ts2009BookChapter[]
    | Record<string, Ts2009BookChapter | Ts2009BookVerse[]>;
};

const parseTs2009VerseText = (verse: Ts2009BookVerse): string | null => {
  if (typeof verse.text === "string") return verse.text;
  if (typeof verse.translation === "string") return verse.translation;
  return null;
};

const extractTs2009ChapterFromBook = (
  payload: Ts2009BookPayload,
  chapter: number,
): Ts2009BookVerse[] | null => {
  const chapters = payload.chapters;
  if (!chapters) return null;

  if (Array.isArray(chapters)) {
    const chapterMatch = chapters.find((entry) => {
      const chapterNumber = Number(entry.number ?? entry.chapter ?? Number.NaN);
      return Number.isFinite(chapterNumber) && chapterNumber === chapter;
    });

    return Array.isArray(chapterMatch?.verses) ? chapterMatch.verses : null;
  }

  const chapterEntry = chapters[String(chapter)];
  if (Array.isArray(chapterEntry)) {
    return chapterEntry;
  }

  return Array.isArray(chapterEntry?.verses) ? chapterEntry.verses : null;
};

const fetchTs2009ChapterFromBookFile = async (
  bookId: string,
  chapter: number,
): Promise<Map<number, string> | null> => {
  for (const fileStem of ts2009BookFileStems(bookId)) {
    try {
      let staticBook: Ts2009BookPayload;
      try {
        staticBook = await ts2009Request<Ts2009BookPayload>(
          ts2009BookFileName(fileStem),
        );
      } catch {
        staticBook = await staticDataRequest<Ts2009BookPayload>(
          ts2009BookAssetPath(fileStem),
        );
      }

      const chapterVerses = extractTs2009ChapterFromBook(staticBook, chapter);
      if (!chapterVerses || chapterVerses.length === 0) {
        continue;
      }

      const verseMap = new Map<number, string>();
      for (const [index, verse] of chapterVerses.entries()) {
        const verseNumber = Number(verse.number ?? verse.verse ?? index + 1);
        const verseText = parseTs2009VerseText(verse);

        if (!Number.isFinite(verseNumber) || !verseText) {
          continue;
        }

        verseMap.set(verseNumber, verseText);
      }

      if (verseMap.size > 0) {
        return verseMap;
      }
    } catch {
      // Keep probing candidate names.
    }
  }

  return null;
};

export const fetchTs2009ChapterStatic = (
  bookId: string,
  chapter: number,
): Promise<Map<number, string> | null> => {
  const cacheKey = `${bookId}:${chapter}`;

  const cached = ts2009ChapterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<Map<number, string> | null> => {
    if (!ts2009ChapterFilesUnavailable) {
      try {
        const staticChapter = await staticDataRequest<{
          verses?: Record<string, string>;
        }>(ts2009ChapterAssetPath(bookId, chapter));

        const verses = staticChapter.verses ?? {};
        const verseMap = new Map<number, string>();
        for (const [verseKey, translation] of Object.entries(verses)) {
          const verseNumber = Number(verseKey);
          if (Number.isFinite(verseNumber) && typeof translation === "string") {
            verseMap.set(verseNumber, translation);
          }
        }

        if (verseMap.size > 0) {
          return verseMap;
        }
      } catch {
        // Chapter files are unpublished. Later chapters go straight to the book file.
        ts2009ChapterFilesUnavailable = true;
      }
    }

    return fetchTs2009ChapterFromBookFile(bookId, chapter);
  })();

  ts2009ChapterCache.set(cacheKey, promise);
  return promise;
};
