import type { ScriptureSourceLanguage } from "@davar/shared/greekBesorah";

export type WordResponse = {
  position: number;
  text: string;
  lemma?: string;
  strong?: string;
  morph?: string;
  prefixes: string[];
  has_dss_variant: boolean;
  translit_en?: string;
  translit_es?: string;
  translit_he?: string;
  lemma_translit_en?: string;
  lemma_translit_es?: string;
  lemma_translit_he?: string;
  source_language?: ScriptureSourceLanguage;
};

export type DssVariant = {
  position: number;
  dss_word: string;
  masoretic_word: string;
  dss_translit_en?: string;
  dss_translit_es?: string;
  comment_v2_en?: string;
  comment_v2_es?: string;
  comment_v2_he?: string;
  masoretic_strong?: string;
  dss_strong?: string;
};

export type TranslationFootnote = {
  marker: string;
  number: string;
  word: string;
  explanation: string;
};

export type VerseResponse = {
  chapter: number;
  verse: number;
  sourceChapter?: number;
  sourceVerse?: number;
  hebrew: string;
  text?: string;
  source_language?: ScriptureSourceLanguage;
  edition?: string;
  revision?: string;
  available?: boolean;
  words: WordResponse[];
  translation?: string;
  translation_language?: string;
  translation_footnotes?: TranslationFootnote[];
  dss?: DssVariant[];
};

export type DefinitionItem = {
  text: string;
  source: string;
  language: string;
  review_status?: "approved" | "imported" | "draft";
  license?: string;
};

export type LexiconResponse = {
  strong_number: string;
  hebrew?: string;
  greek?: string;
  source_language?: ScriptureSourceLanguage;
  edition?: string;
  revision?: string;
  lemma?: string;
  translit_en?: string;
  translit_es?: string;
  translit_he?: string;
  lemma_translit_en?: string;
  lemma_translit_es?: string;
  lemma_translit_he?: string;
  short_meaning?: string;
  full_definition?: string;
  definitions: DefinitionItem[];
  root?: string;
  root_strong?: string;
  root_translit_en?: string;
  root_translit_es?: string;
  root_definitions?: DefinitionItem[];
  occurrences_count: number;
  instances: string[];
};

export type BookResponse = {
  id: string;
  name: string;
  section: "torah" | "neviim" | "ketuvim" | "besorah";
  chapters: number;
  order: number;
  hebrew_name: string;
  hebrew_transliteration: string;
  spanish_name: string;
};
