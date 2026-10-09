import {
  fetchDssVariants,
  fetchHebrewVerses,
  fetchTranslationVerses,
  type DssVariantRow,
  type HebrewVerseRow,
  type TranslationRow,
} from "@/src/services/database";
import type { TranslationFootnote, WordResponse } from "@/src/types/api";
import { removeMaqafForDisplay } from "@/src/utils/hebrew";
import { resolveTranslationTarget } from "@davar/shared/translationConfig";
import {
  type DisplayVerse,
  type DisplayWord,
  type ReferenceMode,
  formatBookName,
  getDssMasoreticSpan,
  getRequiredTranslationChapters,
  getSourceChaptersForRequest,
  isRenderableDssWord,
  resolveTranslationText,
} from "./scriptureDisplay";

// ── Offline mapping: SQLite rows → DisplayVerse[] ──────────────────────────

const mapOfflineDataToDisplay = (
  bookId: string,
  hebrewRows: HebrewVerseRow[],
  translationRows: TranslationRow[],
  dssRows: DssVariantRow[],
  language?: "en" | "es",
  referenceMode: ReferenceMode = "source",
  requestedChapter?: number,
): DisplayVerse[] => {
  // Index translations by verse number
  const translationMap = new Map<string, TranslationRow>();
  for (const tr of translationRows) {
    translationMap.set(`${tr.chapter}-${tr.verse}`, tr);
  }

  // Group DSS variants by chapter-verse
  const dssMap = new Map<string, DssVariantRow[]>();
  for (const dss of dssRows) {
    const key = `${dss.chapter}-${dss.verse}`;
    const existing = dssMap.get(key) ?? [];
    existing.push(dss);
    dssMap.set(key, existing);
  }

  const mappedVerses = hebrewRows.map((hv) => {
    const verseKey = `${hv.chapter}-${hv.verse}`;
    const translationTarget = resolveTranslationTarget(
      bookId,
      hv.chapter,
      hv.verse,
      { language },
    );
    const mappedTranslationKey = translationTarget.reference
      ? `${translationTarget.reference.chapter}-${translationTarget.reference.verse}`
      : null;
    const translation = mappedTranslationKey
      ? translationMap.get(mappedTranslationKey)
      : undefined;
    const translationText = resolveTranslationText({
      bookId,
      language,
      mappedTranslationKey,
      translationTitle: undefined,
      translationText: translation?.text,
    });
    const dssVariants = dssMap.get(verseKey) ?? [];

    // Build DSS variant lookup by position
    const dssPositionMap = new Map<number, DssVariantRow>();
    for (const dss of dssVariants) {
      dssPositionMap.set(dss.position, dss);
    }

    const wordObjects = Array.isArray(hv.words) ? hv.words : [];
    const words: DisplayWord[] = wordObjects
      .filter((word) => word && typeof word === "object")
      .map((word, index) => {
        const typedWord = word as WordResponse;
        const position = typedWord.position ?? index + 1;
        const dssVariant = dssPositionMap.get(position);
        const dssData = dssVariant?.data as
          | Record<string, string | undefined>
          | undefined;
        const hasRenderableQumranVariant = Boolean(
          dssData && isRenderableDssWord(dssData.dss_word),
        );
        const dssTranslitEn = dssData?.dss_translit_en ?? dssData?.translit_en;
        const dssTranslitEs = dssData?.dss_translit_es ?? dssData?.translit_es;
        const prefersDssTranslit = hasRenderableQumranVariant;

        return {
          position,
          text: typedWord.text ?? "",
          strong: typedWord.strong,
          prefixes: typedWord.prefixes ?? [],
          hasQumranVariant: hasRenderableQumranVariant,
          qumranSpan: hasRenderableQumranVariant
            ? getDssMasoreticSpan(
                (
                  dssVariant?.data as
                    | Record<string, string | undefined>
                    | undefined
                )?.masoretic_word,
              )
            : undefined,
          morph: typedWord.morph,
          translit_en: prefersDssTranslit
            ? dssTranslitEn
            : typedWord.translit_en,
          translit_es: prefersDssTranslit
            ? dssTranslitEs
            : typedWord.translit_es,
          dss_translit_en: dssTranslitEn,
          dss_translit_es: dssTranslitEs,
          dssWord: hasRenderableQumranVariant ? dssData?.dss_word : undefined,
          dssStrong: dssData?.dss_strong,
          dssCommentaryEn: dssData?.comment_v2_en,
          dssCommentaryEs: dssData?.comment_v2_es,
          dssCommentaryHe: dssData?.comment_v2_he,
        };
      });

    const qumranVariants = dssVariants
      .filter((dss) =>
        isRenderableDssWord((dss.data as Record<string, string>)?.dss_word),
      )
      .map((dss) => ({
        position: Math.max(dss.position, 0),
        dssWord: (dss.data as Record<string, string>)?.dss_word ?? "",
      }));

    // Reconstruct hebrew text from words if not stored directly
    const hebrew = words
      .map((word) => removeMaqafForDisplay(word.text))
      .filter(Boolean)
      .join(" ");

    // Parse footnotes from translation row
    let translationFootnotes: TranslationFootnote[] | undefined;
    if (translation?.footnotes && Array.isArray(translation.footnotes)) {
      translationFootnotes = translation.footnotes as TranslationFootnote[];
    }

    const outputChapter =
      referenceMode === "translation"
        ? (translationTarget.reference?.chapter ?? 0)
        : hv.chapter;
    const outputVerse =
      referenceMode === "translation"
        ? (translationTarget.reference?.verse ?? 0)
        : hv.verse;

    return {
      id: `${bookId}-${outputChapter}-${outputVerse}`,
      book: formatBookName(bookId),
      bookId,
      chapter: outputChapter,
      verse: outputVerse,
      sourceChapter: hv.chapter,
      sourceVerse: hv.verse,
      hebrew,
      translation: translationText,
      words,
      qumranVariants: qumranVariants.length > 0 ? qumranVariants : undefined,
      translation_footnotes: translationFootnotes,
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

// ── Offline fetch from SQLite ──────────────────────────────────────────────

export const fetchChapterVersesOffline = async (
  bookId: string,
  chapter: number,
  options?: {
    language?: "en" | "es";
    showDss?: boolean;
    referenceMode?: ReferenceMode;
  },
): Promise<DisplayVerse[]> => {
  const referenceMode = options?.referenceMode ?? "source";
  const sourceChapters = getSourceChaptersForRequest(
    bookId,
    chapter,
    options?.language,
    referenceMode,
  );

  const hebrewRows = (
    await Promise.all(
      sourceChapters.map((sourceChapter) =>
        fetchHebrewVerses(bookId, sourceChapter),
      ),
    )
  ).flat();
  if (hebrewRows.length === 0) {
    throw new Error(`No offline Hebrew data for ${bookId} chapter ${chapter}`);
  }

  const translationLanguage = options?.language;
  const translationRows = translationLanguage
    ? (
        await Promise.all(
          getRequiredTranslationChapters(
            bookId,
            hebrewRows.map((row) => ({
              chapter: row.chapter,
              verse: row.verse,
            })),
            translationLanguage,
          ).map((translationChapter) =>
            fetchTranslationVerses(
              bookId,
              translationChapter,
              translationLanguage,
            ),
          ),
        )
      ).flat()
    : [];

  const dssRows = options?.showDss
    ? (
        await Promise.all(
          sourceChapters.map((sourceChapter) =>
            fetchDssVariants(bookId, sourceChapter),
          ),
        )
      ).flat()
    : [];

  return mapOfflineDataToDisplay(
    bookId,
    hebrewRows,
    translationRows,
    dssRows,
    translationLanguage,
    referenceMode,
    chapter,
  );
};
