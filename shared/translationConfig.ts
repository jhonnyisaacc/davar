// Translation configuration utilities for footnote handling and display rules

import {
  mapHebrewVerseToTranslationReference,
  type VerseReference,
} from "./versification";

export type AppLanguage = "en" | "es" | "he";
export type BesorahTextVersion = "delitzsch" | "hutter";
export type TranslationKey = "ts2009" | "tth" | "delitzsch";
export type TranslationSource = "ts2009" | "tth" | "bes";

export type TranslationTarget = {
  reference: VerseReference | null;
  usesPsalmTitle: boolean;
};

export type TranslationResolverOptions = {
  language?: Exclude<AppLanguage, "he">;
  source?: TranslationSource;
};

type DssCommentaryInput = {
  comment_v2_en?: string | null;
  comment_v2_es?: string | null;
  comment_v2_he?: string | null;
  commentary_v2_en?: string | null;
  commentary_v2_es?: string | null;
  commentary_v2_he?: string | null;
  dssCommentaryEn?: string | null;
  dssCommentaryEs?: string | null;
  dssCommentaryHe?: string | null;
};

// Mapping from canonical English book names to TTH_2 Hebrew file names
// TTH_2 covers 36 books (Torah, some Neviim, some Ketuvim, some Besorah)
export const TTH_BOOK_MAPPING: Record<string, string> = {
  // TORAH
  "Genesis": "bereshit",
  "Exodus": "shemot",
  "Leviticus": "vaikra",
  "Numbers": "bamidbar",
  "Deuteronomy": "devarim",
  // NEVIIM (Former Prophets)
  "Joshua": "iehoshua",
  "Judges": "shoftim",
  "Samuel1": "shemuel_alef",
  "Samuel2": "shemuel_bet",
  "Kings1": "melajim_alef",
  "Kings2": "melajim_bet",
  // NEVIIM (Latter Prophets)
  "Isaiah": "ieshaiahu",
  "Jeremiah": "irmeiahu",
  "Ezekiel": "iejezkel",
  // NEVIIM (The Twelve)
  "Hosea": "hoshea",
  "Joel": "ioel",
  "Amos": "amos",
  "Jonah": "ionah",
  "Micah": "micah",
  "Nahum": "najum",
  "Habakkuk": "jabakuk",
  "Zephaniah": "tzefaniah",
  "Haggai": "jagai",
  "Zechariah": "zejariah",
  "Malachi": "malaji",
  // KETUVIM (partial in tth_2)
  "Psalms": "tehilim",
  "Proverbs": "mishlei",
  "SongOfSolomon": "shir_hashirim",
  // BESORAH (tth_2 format)
  "Matthew": "matityahu",
  "Mark": "markos",
  "Luke": "lukas",
  "John": "iojanan",
  "Acts": "maasei_hashlijim",
  "Romans": "romanos",
  "Galatians": "galatas",
  "Revelation": "sodot",
};

export const getTranslationKey = (language: AppLanguage): TranslationKey => {
  switch (language) {
    case "en":
      return "ts2009";
    case "es":
      return "tth";
    case "he":
      return "delitzsch";
    default:
      return "ts2009"; // fallback
  }
};

export const resolveTranslationSource = (
  bookId: string,
  options?: TranslationResolverOptions,
): TranslationSource | undefined => {
  if (options?.source) {
    return options.source;
  }

  const language = options?.language;
  if (!language) {
    return undefined;
  }

  if (language === "en") {
    return "ts2009";
  }

  if (language === "es") {
    const normalizedBookId = normalizeBookToken(bookId);
    const supportsTth = Object.keys(TTH_BOOK_MAPPING).some(
      (bookKey) => normalizeBookToken(bookKey) === normalizedBookId,
    );
    return supportsTth ? "tth" : "bes";
  }

  return undefined;
};

const shouldApplyVersificationMapping = (source?: TranslationSource): boolean => {
  return source === "ts2009" || source === "tth" || source === "bes";
};

const normalizeBookToken = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const isPsalmsBook = (bookId: string): boolean =>
  normalizeBookToken(bookId) === "psalms";

export const resolveTranslationTarget = (
  bookId: string,
  chapter: number,
  verse: number,
  options?: TranslationResolverOptions,
): TranslationTarget => {
  const source = resolveTranslationSource(bookId, options);

  if (shouldApplyVersificationMapping(source)) {
    const mappedReference = mapHebrewVerseToTranslationReference(
      bookId,
      chapter,
      verse,
    );

    if (!mappedReference) {
      return {
        reference: null,
        usesPsalmTitle: isPsalmsBook(bookId),
      };
    }

    return {
      reference: mappedReference,
      usesPsalmTitle: false,
    };
  }

  return {
    reference: { chapter, verse },
    usesPsalmTitle: false,
  };
};

export const resolveTranslationLookupKey = (
  bookId: string,
  chapter: number,
  verse: number,
  options?: TranslationResolverOptions,
): string | null => {
  const target = resolveTranslationTarget(bookId, chapter, verse, options);

  if (!target.reference) {
    return null;
  }

  return `${target.reference.chapter}-${target.reference.verse}`;
};

export const resolveGreekOverlayLanguage = (
  language: AppLanguage,
  translationOnly = false,
): Exclude<AppLanguage, "he"> | "he" | undefined => {
  if (translationOnly) {
    return language === "es" ? "es" : "en";
  }
  if (language === "he") return "he";
  if (language === "es") return "es";
  return "en";
};

export const shouldHideTranslationText = (
  language: AppLanguage,
  hebrewOnly = false,
  sourceLanguage: "hebrew" | "greek" = "hebrew",
): boolean => {
  if (hebrewOnly) return true;
  if (sourceLanguage === "greek") return false;
  return language === "he";
};

export const getDssCommentaryForLanguage = (
  language: AppLanguage,
  commentary?: DssCommentaryInput | null,
): string | undefined => {
  if (!commentary) return undefined;

  const commentaryEn =
    commentary.comment_v2_en ??
    commentary.commentary_v2_en ??
    commentary.dssCommentaryEn;
  const commentaryEs =
    commentary.comment_v2_es ??
    commentary.commentary_v2_es ??
    commentary.dssCommentaryEs;
  const commentaryHe =
    commentary.comment_v2_he ??
    commentary.commentary_v2_he ??
    commentary.dssCommentaryHe;

  if (language === "he") {
    return commentaryHe ?? undefined;
  }

  if (language === "es") {
    return commentaryEs ?? commentaryEn ?? commentaryHe ?? undefined;
  }

  return commentaryEn ?? commentaryEs ?? commentaryHe ?? undefined;
};

export const shouldHideSuperscripts = (
  translationKey: TranslationKey,
): boolean => {
  // TS2009 embeds numeric superscripts that are currently not interactive in UI.
  // TTH markers remain visible so the mobile app can render tappable footnotes.
  return translationKey === "ts2009";
};

const MISSING_SPANISH_TRANSLATION_NOTICE: Record<AppLanguage, string> = {
  en: "At the moment we do not have a Spanish translation for this text, we are working on it...",
  es: "Por el momento no contamos con traducción al español de este texto, estamos trabajando en ello...",
  he: "At the moment we do not have a Spanish translation for this text, we are working on it...",
};

const PSALMS_SUPERSCRIPTION_NOTICE: Record<AppLanguage, string> = {
  en: "This is probably a title in the translation, go to the next verse...",
  es: "Probablemente este es un título en la traducción, ve al siguiente versículo...",
  he: "This is probably a title in the translation, go to the next verse...",
};

export const getMissingSpanishTranslationNotice = (
  language: AppLanguage,
): string => {
  if (language === "en") return "";
  return MISSING_SPANISH_TRANSLATION_NOTICE[language] ?? MISSING_SPANISH_TRANSLATION_NOTICE.es;
};

export const getPsalmsSuperscriptionNotice = (
  language: AppLanguage,
): string => PSALMS_SUPERSCRIPTION_NOTICE[language] ?? PSALMS_SUPERSCRIPTION_NOTICE.en;
