import {
  buildLexiconAssets,
  type LexiconDefinitionAsset,
  type LexiconEntryAsset,
  mapLexiconDefinitions,
} from "@davar/shared/lexiconAssets";
import type { LexiconResponse } from "@/src/types/api";

type LexiconSources = Parameters<typeof buildLexiconAssets>;

export interface DictionaryBundle {
  words?: LexiconSources[0];
  roots: LexiconSources[1];
  custom_definitions: LexiconSources[2];
  prefixes: Record<string, unknown>;
}

const LANGUAGES = ["en", "es", "he"] as const;

const allLanguages = (
  definitions: LexiconDefinitionAsset[] | undefined,
): LexiconResponse["definitions"] =>
  LANGUAGES.flatMap((language) => mapLexiconDefinitions(definitions, language));

const toOfflineEntry = (entry: LexiconEntryAsset): LexiconResponse => ({
  strong_number: entry.strong_number,
  hebrew: entry.hebrew,
  translit_en: entry.translit_en,
  translit_es: entry.translit_es,
  definitions: allLanguages(entry.definitions),
  root: entry.root,
  root_strong: entry.root_strong,
  root_definitions: allLanguages(entry.root_definitions),
  occurrences_count: entry.occurrences_count,
  instances: [],
});

export const buildLexiconEntries = (
  bundle: DictionaryBundle,
): LexiconResponse[] => {
  const { shards } = buildLexiconAssets(
    bundle.words ?? {},
    bundle.roots ?? {},
    bundle.custom_definitions ?? {},
  );
  return Object.values(shards).flatMap((shard) =>
    Object.values(shard).map(toOfflineEntry),
  );
};
