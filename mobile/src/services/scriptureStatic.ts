import { selectDssTransliteration } from "@davar/shared/dssTransliteration";
import { tthBookAssetPath } from "@davar/shared/scripturePaths";
import { staticDataRequest } from "@/src/services/api";
import { removeMaqafForDisplay } from "@/src/utils/hebrew";
import {
  type BesorahTextVersion,
  resolveTranslationTarget,
} from "@davar/shared/translationConfig";
import {
  type DisplayVerse,
  type DisplayWord,
  type ReferenceMode,
  formatBookName,
  getDssMasoreticSpan,
  getSourceChaptersForRequest,
  isRenderableDssWord,
  resolveTranslationText,
  resolveTthBookId,
} from "./scriptureDisplay";
import {
  type StaticChapterVerse,
  type StaticChapterWord,
  type StaticDssDifference,
  type StaticDssTranslitVariant,
  type StaticTranslitWord,
  type TranslationEntry,
  loadStaticDssForChapter,
  loadStaticDssTranslitForChapter,
  loadStaticSourceChapterVerses,
  loadStaticTranslationsForChapter,
  loadStaticTranslitForChapter,
} from "./scriptureStaticLoad";
import { fetchTs2009ChapterStatic } from "./scriptureTs2009";

const HEBREW_MARKS_RE = /[\u0591-\u05C7]/g;

const normalizeSurfaceWord = (value?: string): string =>
  (value ?? "").replaceAll("/", "").replace(HEBREW_MARKS_RE, "");

const extractBaseStrong = (value?: string): string | undefined => {
  if (!value) return undefined;

  const parts = value
    .toUpperCase()
    .replace(/\s+/g, "")
    .split("/")
    .filter(Boolean);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (/^[HGD]\d+$/.test(parts[index])) {
      return parts[index];
    }
  }

  return parts.length > 0 ? parts[parts.length - 1] : undefined;
};

const findFallbackTranslitWord = (
  word: StaticChapterWord,
  translitWords: StaticTranslitWord[],
): StaticTranslitWord | undefined => {
  const baseStrong = extractBaseStrong(word.strong);
  const normalizedText = normalizeSurfaceWord(word.text);

  if (!baseStrong && !normalizedText) {
    return undefined;
  }

  return translitWords.find((candidate) => {
    const candidateStrong = extractBaseStrong(candidate.strong);
    const candidateText = normalizeSurfaceWord(candidate.text);

    const strongMatches =
      baseStrong && candidateStrong ? baseStrong === candidateStrong : false;
    const textMatches =
      normalizedText && candidateText
        ? normalizedText === candidateText
        : false;

    if (baseStrong && !strongMatches) return false;
    if (normalizedText && !textMatches) return false;

    return strongMatches || textMatches;
  });
};

const mapStaticVersesToDisplay = (
  bookId: string,
  verses: StaticChapterVerse[],
  translationMap: Map<string, TranslationEntry>,
  translationTitleMap: Map<number, string>,
  dssMap: Map<string, StaticDssDifference[]>,
  translitMap: Map<string, StaticTranslitWord[]>,
  dssTranslitMap: Map<string, StaticDssTranslitVariant>,
  language?: "en" | "es",
  showDss?: boolean,
  referenceMode: ReferenceMode = "source",
  requestedChapter?: number,
): DisplayVerse[] => {
  const mappedVerses = verses.map((verse) => {
    const dssKey = `${verse.chapter}:${verse.verse}`;
    const dssVariants = showDss ? (dssMap.get(dssKey) ?? []) : [];
    const dssVariantMap = new Map(
      dssVariants.map((variant) => [variant.position, variant]),
    );

    const sourceWords = Array.isArray(verse.words) ? verse.words : [];
    const translitWords = translitMap.get(dssKey) ?? [];
    const canMapTranslitByPosition =
      translitWords.length === sourceWords.length;
    const words: DisplayWord[] = sourceWords.map((word, index) => {
      const position = index + 1;
      const dssVariant = dssVariantMap.get(position);
      const hasRenderableQumranVariant = Boolean(
        dssVariant && isRenderableDssWord(dssVariant.dss_word),
      );
      const translitWord = canMapTranslitByPosition
        ? translitWords[index]
        : findFallbackTranslitWord(word, translitWords);
      const dssTranslit = dssTranslitMap.get(
        `${verse.chapter}:${verse.verse}:${position}`,
      );
      const prefersDssTranslit = Boolean(showDss && hasRenderableQumranVariant);
      const dssTranslitEn = selectDssTransliteration(
        dssVariant?.dss_translit_en,
        dssTranslit?.translit_en ?? dssVariant?.translit_en,
      );
      const dssTranslitEs = selectDssTransliteration(
        dssVariant?.dss_translit_es,
        dssTranslit?.translit_es ?? dssVariant?.translit_es,
      );

      return {
        position,
        text: word.text ?? "",
        strong: word.strong,
        prefixes: word.prefixes ?? [],
        hasQumranVariant: hasRenderableQumranVariant,
        qumranSpan: hasRenderableQumranVariant
          ? getDssMasoreticSpan(dssVariant?.masoretic_word)
          : undefined,
        morph: word.morph,
        translit_en: prefersDssTranslit
          ? dssTranslitEn
          : (word.translit_en ?? translitWord?.translit_en),
        translit_es: prefersDssTranslit
          ? dssTranslitEs
          : (word.translit_es ?? translitWord?.translit_es),
        dss_translit_en: dssTranslitEn,
        dss_translit_es: dssTranslitEs,
        dssWord: hasRenderableQumranVariant ? dssVariant?.dss_word : undefined,
        dssStrong: dssVariant?.dss_strong,
        dssCommentaryEn: dssVariant?.comment_v2_en,
        dssCommentaryEs: dssVariant?.comment_v2_es,
        dssCommentaryHe: dssVariant?.comment_v2_he,
      };
    });

    const hebrewText =
      verse.hebrew ??
      sourceWords
        .map((word) => word.text ?? "")
        .filter(Boolean)
        .join(" ");

    const translationTarget = resolveTranslationTarget(
      bookId,
      verse.chapter,
      verse.verse,
      { language },
    );

    const translationKey = translationTarget.reference
      ? `${translationTarget.reference.chapter}-${translationTarget.reference.verse}`
      : null;
    const translationEntry = translationKey
      ? translationMap.get(translationKey)
      : undefined;
    const translationText = resolveTranslationText({
      bookId,
      language,
      mappedTranslationKey: translationKey,
      translationTitle: translationTarget.usesPsalmTitle
        ? translationTitleMap.get(verse.chapter)
        : undefined,
      translationText: translationEntry?.text,
    });

    const outputChapter =
      referenceMode === "translation"
        ? (translationTarget.reference?.chapter ?? 0)
        : verse.chapter;
    const outputVerse =
      referenceMode === "translation"
        ? (translationTarget.reference?.verse ?? 0)
        : verse.verse;

    return {
      id: `${bookId}-${outputChapter}-${outputVerse}`,
      book: formatBookName(bookId),
      bookId,
      chapter: outputChapter,
      verse: outputVerse,
      sourceChapter: verse.chapter,
      sourceVerse: verse.verse,
      hebrew: removeMaqafForDisplay(hebrewText),
      translation: translationText,
      words,
      qumranVariants:
        dssVariants.length > 0
          ? dssVariants
              .filter((variant) => isRenderableDssWord(variant.dss_word))
              .map((variant) => ({
                position: Math.max(variant.position, 0),
                dssWord: variant.dss_word ?? "",
              }))
          : undefined,
      translation_footnotes: translationEntry?.footnotes,
    };
  });

  if (
    referenceMode === "translation" &&
    language &&
    Number.isFinite(requestedChapter)
  ) {
    return mappedVerses
      .filter((verse) => verse.chapter === requestedChapter)
      .sort(
        (a, b) =>
          a.verse - b.verse ||
          a.sourceChapter - b.sourceChapter ||
          a.sourceVerse - b.sourceVerse,
      );
  }

  return mappedVerses.sort(
    (a, b) =>
      a.sourceChapter - b.sourceChapter || a.sourceVerse - b.sourceVerse,
  );
};

export const fetchChapterVersesStatic = async (
  bookId: string,
  chapter: number,
  options?: {
    language?: "en" | "es";
    showDss?: boolean;
    hebrewOnly?: boolean;
    referenceMode?: ReferenceMode;
    besorahTextVersion?: BesorahTextVersion;
  },
): Promise<DisplayVerse[]> => {
  const referenceMode = options?.referenceMode ?? "source";
  const sourceChapters = getSourceChaptersForRequest(
    bookId,
    chapter,
    options?.language,
    referenceMode,
  );

  const besorahTextVersion = options?.besorahTextVersion ?? "delitzsch";
  const sourcePromise = Promise.all(
    sourceChapters.map((sourceChapter) =>
      loadStaticSourceChapterVerses(bookId, sourceChapter, besorahTextVersion),
    ),
  );
  const translitPromise = Promise.all(
    sourceChapters.map((sourceChapter) =>
      loadStaticTranslitForChapter(bookId, sourceChapter),
    ),
  );
  const dssPromise = Promise.all(
    sourceChapters.map((sourceChapter) =>
      loadStaticDssForChapter(bookId, sourceChapter, options?.showDss),
    ),
  );
  const dssTranslitPromise = Promise.all(
    sourceChapters.map((sourceChapter) =>
      loadStaticDssTranslitForChapter(bookId, sourceChapter, options?.showDss),
    ),
  );

  if (!options?.hebrewOnly && options?.language === "en") {
    const guessedChapters =
      referenceMode === "translation" ? [chapter] : sourceChapters;
    for (const guessedChapter of guessedChapters) {
      void fetchTs2009ChapterStatic(bookId, guessedChapter);
    }
  }

  if (!options?.hebrewOnly && options?.language === "es") {
    const tthBookId = resolveTthBookId(bookId);
    if (tthBookId) {
      void staticDataRequest(tthBookAssetPath(tthBookId)).catch(
        () => undefined,
      );
    }
  }

  const sourceVerseChunks = await sourcePromise;
  const sourceVerses = sourceVerseChunks.flat();

  const [translations, dssMaps, translitMaps, dssTranslitMaps] =
    await Promise.all([
      loadStaticTranslationsForChapter(
        bookId,
        sourceVerses,
        options?.language,
        options?.hebrewOnly,
      ),
      dssPromise,
      translitPromise,
      dssTranslitPromise,
    ]);
  const dssMap = dssMaps.reduce((merged, map) => {
    for (const [key, value] of map.entries()) {
      merged.set(key, value);
    }
    return merged;
  }, new Map<string, StaticDssDifference[]>());
  const translitMap = translitMaps.reduce((merged, map) => {
    for (const [key, value] of map.entries()) {
      merged.set(key, value);
    }
    return merged;
  }, new Map<string, StaticTranslitWord[]>());
  const dssTranslitMap = dssTranslitMaps.reduce((merged, map) => {
    for (const [key, value] of map.entries()) {
      merged.set(key, value);
    }
    return merged;
  }, new Map<string, StaticDssTranslitVariant>());

  const { verses: translationMap, titles: translationTitleMap } = translations;

  return mapStaticVersesToDisplay(
    bookId,
    sourceVerses,
    translationMap,
    translationTitleMap,
    dssMap,
    translitMap,
    dssTranslitMap,
    options?.language,
    options?.showDss,
    referenceMode,
    chapter,
  );
};
