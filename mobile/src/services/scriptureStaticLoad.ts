import { staticDataRequest } from "@/src/services/api";
import { fetchTranslationVerses } from "@/src/services/database";
import {
  besBookAssetPath,
  besorahChapterAssetPath,
  hutterChapterAssetPath,
  oeChapterAssetPath,
  tthBookAssetPath,
} from "@davar/shared/scripturePaths";
import {
  dssBookAssetPath,
  dssChapterAssetPath,
  dssTranslitBookAssetPath,
  dssTranslitChapterAssetPath,
  translitBookAssetPath,
  translitChapterAssetPath,
} from "@davar/shared/staticDataPaths";
import type { BesorahTextVersion } from "@davar/shared/translationConfig";
import type { TranslationFootnote } from "@/src/types/api";
import {
  getRequiredTranslationChapters,
  resolveTthBookId,
} from "./scriptureDisplay";
import { fetchTs2009ChapterStatic } from "./scriptureTs2009";

export type StaticChapterWord = {
  text?: string;
  strong?: string;
  morph?: string;
  prefixes?: string[];
  translit_en?: string;
  translit_es?: string;
};

export type StaticChapterVerse = {
  chapter: number;
  verse: number;
  hebrew?: string;
  words?: StaticChapterWord[];
};

type StaticTranslationVerse = {
  verse: number;
  bes?: string;
  tth?: string;
  text?: string;
  footnotes?: unknown[];
};

type StaticTranslationChapter = {
  chapter: number;
  verses?: StaticTranslationVerse[];
  title?: string;
};

type StaticTranslationBook = {
  chapters?: StaticTranslationChapter[];
};

export type StaticDssDifference = {
  dss_translit_en?: string;
  dss_translit_es?: string;
  position: number;
  dss_word?: string;
  translit_en?: string;
  translit_es?: string;
  masoretic_word?: string;
  dss_strong?: string;
  comment_v2_en?: string;
  comment_v2_es?: string;
  comment_v2_he?: string;
};

export type StaticDssTranslitVariant = {
  chapter?: number;
  verse?: number;
  position?: number;
  translit_en?: string;
  translit_es?: string;
};

type StaticDssTranslitBook = {
  variants?: StaticDssTranslitVariant[];
};

type StaticDssVerse = {
  differences?: StaticDssDifference[];
};

type StaticDssChapter = {
  verses?: Record<string, StaticDssVerse>;
};

type StaticDssBook = {
  chapters?: Record<string, StaticDssChapter>;
};

export type StaticTranslitWord = {
  text?: string;
  strong?: string;
  translit_en?: string;
  translit_es?: string;
};

type StaticTranslitBook = {
  verses?: {
    chapter: number;
    verse: number;
    words?: StaticTranslitWord[];
  }[];
};

export type TranslationEntry = {
  text: string;
  footnotes?: TranslationFootnote[];
};

type LoadedStaticTranslations = {
  verses: Map<string, TranslationEntry>;
  titles: Map<number, string>;
};

const parseTranslationFootnotes = (
  rawFootnotes: unknown,
): TranslationFootnote[] | undefined => {
  if (!Array.isArray(rawFootnotes) || rawFootnotes.length === 0) {
    return undefined;
  }

  const parsed = rawFootnotes
    .map((footnote): TranslationFootnote | null => {
      if (typeof footnote === "string") {
        const match = /^\[([a-z0-9]+)\]\s*(.*)$/i.exec(footnote);
        if (!match) {
          return {
            marker: "",
            number: "",
            word: "",
            explanation: footnote,
          };
        }

        return {
          marker: match[1],
          number: "",
          word: "",
          explanation: match[2],
        };
      }

      if (footnote && typeof footnote === "object") {
        const typed = footnote as Record<string, unknown>;
        return {
          marker: String(typed.marker ?? ""),
          number: String(typed.number ?? ""),
          word: String(typed.word ?? ""),
          explanation: String(typed.explanation ?? ""),
        };
      }

      return null;
    })
    .filter((footnote): footnote is TranslationFootnote => Boolean(footnote));

  return parsed.length > 0 ? parsed : undefined;
};

export const loadStaticTranslationsForChapter = async (
  bookId: string,
  sourceVerses: StaticChapterVerse[],
  language?: "en" | "es",
  hebrewOnly?: boolean,
): Promise<LoadedStaticTranslations> => {
  const translationMap = new Map<string, TranslationEntry>();
  const translationTitleMap = new Map<number, string>();
  const hasTranslationText = (entry?: TranslationEntry): boolean =>
    Boolean(entry?.text.trim());
  const requiredTranslationChapters = getRequiredTranslationChapters(
    bookId,
    sourceVerses.map((verse) => ({
      chapter: verse.chapter,
      verse: verse.verse,
    })),
    language,
  );

  if (!language || hebrewOnly) {
    return {
      verses: translationMap,
      titles: translationTitleMap,
    };
  }

  if (language === "es") {
    // Try TTH_2 first (official Spanish translation)
    const tthBookId = resolveTthBookId(bookId);
    if (tthBookId) {
      try {
        const translationBook = await staticDataRequest<StaticTranslationBook>(
          tthBookAssetPath(tthBookId),
        );

        for (const translationChapter of requiredTranslationChapters) {
          const chapterData = (translationBook.chapters ?? []).find(
            (item) => item.chapter === translationChapter,
          );

          if (!chapterData?.verses) {
            continue;
          }

          if (
            typeof chapterData.title === "string" &&
            chapterData.title.trim()
          ) {
            translationTitleMap.set(
              translationChapter,
              chapterData.title.trim(),
            );
          }

          for (const verse of chapterData.verses) {
            const text = verse.tth ?? "";
            translationMap.set(`${translationChapter}-${verse.verse}`, {
              text,
              footnotes: parseTranslationFootnotes(verse.footnotes),
            });
          }
        }

        const tthCoversRequiredChapters = requiredTranslationChapters.every(
          (translationChapter) =>
            (translationBook.chapters ?? []).some(
              (item) =>
                item.chapter === translationChapter &&
                (item.verses ?? []).some((verse) =>
                  (verse.tth ?? verse.bes ?? "").trim(),
                ),
            ),
        );
        if (tthCoversRequiredChapters) {
          return {
            verses: translationMap,
            titles: translationTitleMap,
          };
        }
      } catch {
        // TTH_2 not available for this book, try BES fallback below
      }
    }

    // Fill genuinely missing TTH verses from BES.
    try {
      const translationBook = await staticDataRequest<StaticTranslationBook>(
        besBookAssetPath(bookId),
      );

      for (const translationChapter of requiredTranslationChapters) {
        const chapterData = (translationBook.chapters ?? []).find(
          (item) => item.chapter === translationChapter,
        );

        if (!chapterData?.verses) {
          continue;
        }

        if (
          !translationTitleMap.has(translationChapter) &&
          typeof chapterData.title === "string" &&
          chapterData.title.trim()
        ) {
          translationTitleMap.set(translationChapter, chapterData.title.trim());
        }

        for (const verse of chapterData.verses) {
          const key = `${translationChapter}-${verse.verse}`;
          if (!hasTranslationText(translationMap.get(key))) {
            const text = verse.bes ?? "";
            translationMap.set(key, {
              text,
              footnotes: parseTranslationFootnotes(verse.footnotes),
            });
          }
        }
      }
    } catch {
      // Translation is optional; return SQLite fallback below when available.
    }
  } else if (language === "en") {
    // Load TS2009 from static chapter JSON (same source as web)
    try {
      const chapterMaps = await Promise.all(
        requiredTranslationChapters.map(async (translationChapter) => ({
          translationChapter,
          chapterMap: await fetchTs2009ChapterStatic(
            bookId,
            translationChapter,
          ),
        })),
      );

      for (const { translationChapter, chapterMap } of chapterMaps) {
        if (!chapterMap) {
          continue;
        }

        for (const [verseNumber, translation] of chapterMap) {
          translationMap.set(`${translationChapter}-${verseNumber}`, {
            text: translation,
            footnotes: undefined,
          });
        }
      }
    } catch (error) {
      console.warn(
        `Failed to load TS2009 translations for ${bookId} chapters ${requiredTranslationChapters.join(",")}:`,
        error,
      );
      // Fall back to SQLite below
    }
  }

  if (translationMap.size === 0) {
    try {
      const rowsByChapter = await Promise.all(
        requiredTranslationChapters.map((translationChapter) =>
          fetchTranslationVerses(bookId, translationChapter, language),
        ),
      );

      for (const offlineRows of rowsByChapter) {
        for (const row of offlineRows) {
          translationMap.set(`${row.chapter}-${row.verse}`, {
            text: row.text ?? "",
            footnotes: parseTranslationFootnotes(row.footnotes),
          });
        }
      }
    } catch {
      // Leave translation map empty when offline translation isn't available.
    }
  }

  return {
    verses: translationMap,
    titles: translationTitleMap,
  };
};

export const loadStaticDssForChapter = async (
  bookId: string,
  chapter: number,
  showDss?: boolean,
): Promise<Map<string, StaticDssDifference[]>> => {
  const dssMap = new Map<string, StaticDssDifference[]>();

  if (!showDss) {
    return dssMap;
  }

  try {
    let verseEntries: Record<string, { differences?: StaticDssDifference[] }> =
      {};
    try {
      const chapterData = await staticDataRequest<{
        verses?: Record<string, { differences?: StaticDssDifference[] }>;
      }>(dssChapterAssetPath(bookId, chapter));
      verseEntries = chapterData.verses ?? {};
    } catch {
      const dssBook = await staticDataRequest<StaticDssBook>(
        dssBookAssetPath(bookId),
      );
      verseEntries = dssBook.chapters?.[String(chapter)]?.verses ?? {};
    }

    for (const [verseKey, verseData] of Object.entries(verseEntries)) {
      const verseNumber = Number(verseKey);
      if (!Number.isFinite(verseNumber)) {
        continue;
      }

      const differences = (verseData.differences ?? []).filter(
        (difference) => difference.position > 0,
      );

      if (differences.length > 0) {
        dssMap.set(`${chapter}:${verseNumber}`, differences);
      }
    }
  } catch {
    // DSS variants are optional; return no variants when unavailable.
  }

  return dssMap;
};

export const loadStaticTranslitForChapter = async (
  bookId: string,
  chapter: number,
): Promise<Map<string, StaticTranslitWord[]>> => {
  try {
    let verses: StaticTranslitBook["verses"] = [];
    try {
      const translitChapter = await staticDataRequest<StaticTranslitBook>(
        translitChapterAssetPath(bookId, chapter),
      );
      verses = translitChapter.verses ?? [];
    } catch {
      const translitBook = await staticDataRequest<StaticTranslitBook>(
        translitBookAssetPath(bookId),
      );
      verses = translitBook.verses ?? [];
    }

    const translitMap = new Map<string, StaticTranslitWord[]>();
    for (const verseEntry of verses) {
      if (verseEntry.chapter !== chapter) {
        continue;
      }
      translitMap.set(`${chapter}:${verseEntry.verse}`, verseEntry.words ?? []);
    }

    return translitMap;
  } catch {
    return new Map<string, StaticTranslitWord[]>();
  }
};

export const loadStaticDssTranslitForChapter = async (
  bookId: string,
  chapter: number,
  showDss?: boolean,
): Promise<Map<string, StaticDssTranslitVariant>> => {
  const dssTranslitMap = new Map<string, StaticDssTranslitVariant>();

  if (!showDss) {
    return dssTranslitMap;
  }

  try {
    let variants: StaticDssTranslitBook["variants"] = [];
    try {
      const translitChapter = await staticDataRequest<StaticDssTranslitBook>(
        dssTranslitChapterAssetPath(bookId, chapter),
      );
      variants = translitChapter.variants ?? [];
    } catch {
      const translitBook = await staticDataRequest<StaticDssTranslitBook>(
        dssTranslitBookAssetPath(bookId),
      );
      variants = translitBook.variants ?? [];
    }

    for (const variant of variants) {
      if (variant.chapter !== chapter) {
        continue;
      }

      const verse = Number(variant.verse);
      const position = Number(variant.position);
      if (
        !Number.isFinite(verse) ||
        !Number.isFinite(position) ||
        position <= 0
      ) {
        continue;
      }

      dssTranslitMap.set(`${chapter}:${verse}:${position}`, variant);
    }
  } catch {
    // DSS transliteration data is optional; fall back to standard transliteration.
  }

  return dssTranslitMap;
};

export const loadStaticSourceChapterVerses = async (
  bookId: string,
  chapter: number,
  besorahTextVersion: BesorahTextVersion = "delitzsch",
): Promise<StaticChapterVerse[]> => {
  const chapterSources = [
    oeChapterAssetPath(bookId, chapter),
    besorahTextVersion === "hutter"
      ? hutterChapterAssetPath(bookId, chapter)
      : besorahChapterAssetPath(bookId, chapter),
  ];
  const sourceErrors: string[] = [];

  for (const source of chapterSources) {
    try {
      const verses = await staticDataRequest<StaticChapterVerse[]>(source);
      if (Array.isArray(verses) && verses.length > 0) {
        return verses;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      sourceErrors.push(`${source}: ${reason}`);
    }
  }

  const details =
    sourceErrors.length > 0
      ? sourceErrors.join(" | ")
      : chapterSources.join(", ");
  throw new Error(
    `No static verse data found for ${bookId} chapter ${chapter}. Sources tried: ${details}`,
  );
};
