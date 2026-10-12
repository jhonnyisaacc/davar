import {
  getMissingSpanishTranslationNotice,
  getPsalmsSuperscriptionNotice,
  resolveTranslationLookupKey,
  resolveTranslationSource,
  TTH_BOOK_MAPPING,
} from "@davar/shared/translationConfig";
import { getSourceChaptersForTranslationChapter } from "@davar/shared/versification";
import type { TranslationFootnote } from "@/src/types/api";

export type DisplayWord = {
  position: number;
  text: string;
  strong?: string;
  prefixes?: string[];
  hasQumranVariant?: boolean;
  /** Number of Masoretic tokens this DSS variant replaces (>=1). */
  qumranSpan?: number;
  morph?: string;
  translit_en?: string;
  translit_es?: string;
  translit_he?: string;
  lemma?: string;
  lemma_translit_en?: string;
  lemma_translit_es?: string;
  lemma_translit_he?: string;
  source_language?: "hebrew" | "greek";
  dss_translit_en?: string;
  dss_translit_es?: string;
  dssWord?: string;
  dssStrong?: string;
  dssCommentaryEn?: string;
  dssCommentaryEs?: string;
  dssCommentaryHe?: string;
};

export type DisplayVerse = {
  id: string;
  book: string;
  bookId: string;
  chapter: number;
  verse: number;
  sourceChapter: number;
  sourceVerse: number;
  hebrew: string;
  text?: string;
  sourceLanguage?: "hebrew" | "greek";
  edition?: string;
  revision?: string;
  available?: boolean;
  translation: string;
  translation_language?: "en" | "es" | "he";
  words: DisplayWord[];
  qumranVariants?: { position: number; dssWord: string }[];
  translation_footnotes?: TranslationFootnote[];
};

export type ReferenceMode = "source" | "translation";

export const formatBookName = (bookId: string) =>
  bookId.charAt(0).toUpperCase() + bookId.slice(1);

const normalizeBookToken = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const TTH_BOOK_KEY_BY_NORMALIZED_TOKEN: Record<string, string> =
  Object.fromEntries(
    Object.keys(TTH_BOOK_MAPPING).map((bookKey) => [
      normalizeBookToken(bookKey),
      bookKey,
    ]),
  );

export const resolveTthBookId = (bookId: string): string | undefined => {
  const canonicalKey =
    TTH_BOOK_KEY_BY_NORMALIZED_TOKEN[normalizeBookToken(bookId)];

  if (!canonicalKey) {
    return undefined;
  }

  return TTH_BOOK_MAPPING[canonicalKey];
};

const isPsalmsBook = (bookId: string): boolean =>
  normalizeBookToken(bookId) === "psalms";

const HEBREW_RUN_RE = /[\u0590-\u05FF]+/g;

const isolateHebrewRuns = (value: string): string =>
  value.replace(HEBREW_RUN_RE, (token) => `\u2067${token}\u2069`);

const finalizeTranslationDisplayText = (value: string): string =>
  value.trim().length > 0 ? isolateHebrewRuns(value) : value;

export const resolveTranslationText = (params: {
  bookId: string;
  language?: "en" | "es";
  mappedTranslationKey: string | null;
  translationTitle?: string;
  translationText?: string;
}): string => {
  const {
    bookId,
    language,
    mappedTranslationKey,
    translationTitle,
    translationText,
  } = params;

  if (!language) {
    return finalizeTranslationDisplayText(translationText ?? "");
  }

  if (translationTitle && translationTitle.trim().length > 0) {
    return finalizeTranslationDisplayText(translationTitle);
  }

  if (isPsalmsBook(bookId) && mappedTranslationKey === null) {
    return finalizeTranslationDisplayText(
      getPsalmsSuperscriptionNotice(language),
    );
  }

  if (translationText && translationText.trim().length > 0) {
    return finalizeTranslationDisplayText(translationText);
  }

  return finalizeTranslationDisplayText(
    getMissingSpanishTranslationNotice(language),
  );
};

const countDssWordTokens = (value?: string): number => {
  if (!value) return 0;

  return value.trim().replace(/[/:]/g, " ").split(/\s+/).filter(Boolean).length;
};

/**
 * Multi-word DSS variants are renderable: they replace the N Masoretic
 * tokens counted from their masoretic_word (span-aware replacement).
 * Only empty/"note" placeholders stay hidden (#103).
 */
export const isRenderableDssWord = (value?: string): value is string => {
  if (!value) return false;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "note") {
    return false;
  }

  return countDssWordTokens(trimmed) > 0;
};

/** Number of Masoretic tokens a DSS variant replaces (its span). */
export const getDssMasoreticSpan = (
  masoreticWord?: string,
  fallback = 1,
): number => {
  const span = countDssWordTokens(masoreticWord);
  return span > 0 ? span : fallback;
};

const getTranslationLookupKey = (
  bookId: string,
  chapter: number,
  verse: number,
  language?: "en" | "es",
): string | null => {
  return resolveTranslationLookupKey(bookId, chapter, verse, { language });
};

export const getRequiredTranslationChapters = (
  bookId: string,
  sourceVerses: { chapter: number; verse: number }[],
  language?: "en" | "es",
): number[] => {
  if (!language) {
    return [];
  }

  const mappedChapters = new Set<number>();

  for (const sourceVerse of sourceVerses) {
    const mappedKey = getTranslationLookupKey(
      bookId,
      sourceVerse.chapter,
      sourceVerse.verse,
      language,
    );
    if (!mappedKey) {
      continue;
    }

    const [mappedChapterToken] = mappedKey.split("-");
    const mappedChapter = Number(mappedChapterToken);
    if (Number.isFinite(mappedChapter) && mappedChapter > 0) {
      mappedChapters.add(mappedChapter);
    }
  }

  if (mappedChapters.size === 0) {
    for (const sourceVerse of sourceVerses) {
      mappedChapters.add(sourceVerse.chapter);
    }
  }

  return [...mappedChapters].sort((a, b) => a - b);
};

export const getSourceChaptersForRequest = (
  bookId: string,
  chapter: number,
  language: "en" | "es" | undefined,
  referenceMode: ReferenceMode,
): number[] => {
  if (!Number.isFinite(chapter) || chapter <= 0) {
    return [];
  }

  if (!language || referenceMode !== "translation") {
    return [chapter];
  }

  const source = resolveTranslationSource(bookId, { language });
  if (!source) {
    return [chapter];
  }

  const chapters = getSourceChaptersForTranslationChapter(bookId, chapter);
  return chapters.length > 0 ? chapters : [chapter];
};
