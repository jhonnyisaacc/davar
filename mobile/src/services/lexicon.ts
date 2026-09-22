import { instanceSurface } from "@davar/shared/instanceSurface";
import {
  mapLexiconDefinitions,
  type LexiconEntryAsset,
  type LexiconEntryShard,
  type LexiconInstancesAsset,
} from "@davar/shared/lexiconAssets";
import {
  lexiconEntryAssetPath,
  lexiconInstancesAssetPath,
  normalizeStrongNumber,
} from "@davar/shared/staticDataPaths";
import { staticDataRequest } from "@/src/services/api";
import type { LexiconResponse } from "@/src/types/api";

type StaticDictionaryDefinition = {
  text?: string;
  text_en?: string;
  text_es?: string;
  text_he?: string;
  source?: string;
  review_status?: "approved" | "imported" | "draft";
  license?: string;
};

type StaticDictionaryEntry = {
  strong_number?: string;
  lemma?: string;
  translit_en?: string;
  translit_es?: string;
  transliteration_en?: string;
  transliteration_es?: string;
  definitions?: StaticDictionaryDefinition[];
  root_ref?: string;
  root_strong?: string;
  occurrences?: {
    total?: number;
    references?: string[];
    surface_references?: string[];
  };
};

type StaticCustomDefinition = {
  instance_total?: number;
  surface_instances?: { book?: string; chapter?: number; verse?: number; text?: string }[];
  instances?: { book?: string; chapter?: number; verse?: number; text?: string }[];
  oe_instances?: { book?: string; chapter?: number; verse?: number; text?: string }[];
  strong_number?: string;
  hebrew?: string;
  transliteration_en?: string;
  transliteration_es?: string;
  definitions?: StaticDictionaryDefinition[];
  root?: string;
  root_strong?: string;
  manual_instances?: string[];
  nt_instances?: { book?: string; chapter?: number; verse?: number; text?: string }[];
};

const getRootLemma = (
  rootEntry: StaticDictionaryEntry | StaticCustomDefinition | undefined,
): string | undefined => {
  if (!rootEntry) {
    return undefined;
  }
  if ("lemma" in rootEntry && typeof rootEntry.lemma === "string") {
    return rootEntry.lemma;
  }
  if ("hebrew" in rootEntry && typeof rootEntry.hebrew === "string") {
    return rootEntry.hebrew;
  }
  return undefined;
};

const normalizeStrongKey = (value: string): string =>
  value.toUpperCase().replace(/\s+/g, "");

const resolveStrongKey = <T,>(
  dictionary: Record<string, T>,
  lookup: string,
): string | null => {
  if (lookup in dictionary) {
    return lookup;
  }

  const target = normalizeStrongKey(lookup);
  for (const key of Object.keys(dictionary)) {
    if (normalizeStrongKey(key) === target) {
      return key;
    }
  }

  return null;
};

const mapStaticDefinitions = (
  definitions: StaticDictionaryDefinition[] | undefined,
  language: "en" | "es" | "he",
): LexiconResponse["definitions"] =>
  mapLexiconDefinitions(definitions, language);

const toResponseFromAsset = (
  entry: LexiconEntryAsset,
  language: "en" | "es" | "he",
): LexiconResponse => ({
  strong_number: entry.strong_number,
  hebrew: entry.hebrew,
  translit_en: entry.translit_en,
  translit_es: entry.translit_es,
  definitions: mapLexiconDefinitions(entry.definitions, language),
  root: entry.root,
  root_strong: entry.root_strong,
  root_translit_en: entry.root_translit_en,
  root_translit_es: entry.root_translit_es,
  root_definitions: mapLexiconDefinitions(entry.root_definitions, language),
  occurrences_count: entry.occurrences_count,
  instances: (entry.instances ?? []).map((instance) =>
    typeof instance === "string" ? instance : instance.verse,
  ),
});

export const loadLexiconEntryAsset = async (
  strong: string,
): Promise<LexiconEntryAsset | null> => {
  const normalized = normalizeStrongNumber(strong);
  if (!normalized) return null;

  try {
    const shard = await staticDataRequest<LexiconEntryShard>(
      lexiconEntryAssetPath(normalized),
    );
    return shard[normalized] ?? null;
  } catch {
    return null;
  }
};

export const loadLexiconInstances = async (
  strong: string,
): Promise<Partial<LexiconResponse> | null> => {
  const normalized = normalizeStrongNumber(strong);
  if (!normalized) return null;

  try {
    const payload = await staticDataRequest<LexiconInstancesAsset>(
      lexiconInstancesAssetPath(normalized),
    );
    return {
      instances: payload.instances.map((instance) =>
        typeof instance === "string" ? instance : instance.verse,
      ),
      occurrences_count: payload.occurrences_count,
    };
  } catch {
    return null;
  }
};

const loadLexiconEntryFromFullDictionaries = async (
  strong: string,
  language: "en" | "es" | "he",
): Promise<LexiconResponse | null> => {
  const [words, roots, custom] = await Promise.all([
    staticDataRequest<Record<string, StaticDictionaryEntry>>("dict/words.json"),
    staticDataRequest<Record<string, StaticDictionaryEntry>>("dict/roots.json"),
    staticDataRequest<Record<string, StaticCustomDefinition>>(
      "dict/custom_definitions.json",
    ),
  ]);

  const customKey = resolveStrongKey(custom, strong);
  const customEntry = customKey ? custom[customKey] : undefined;
  const wordKey = resolveStrongKey(words, strong);
  const rootDictionaryKey = resolveStrongKey(roots, strong);
  const dictionaryEntry = wordKey
    ? words[wordKey]
    : rootDictionaryKey
      ? roots[rootDictionaryKey]
      : undefined;

  if (!customEntry && !dictionaryEntry) {
    return null;
  }

  const rootStrong =
    customEntry?.root_strong ??
    dictionaryEntry?.root_ref ??
    dictionaryEntry?.root_strong ??
    (dictionaryEntry
      ? (customEntry?.strong_number ?? dictionaryEntry?.strong_number ?? strong)
      : undefined);

  const rootEntry = rootStrong
    ? (roots[resolveStrongKey(roots, rootStrong) ?? ""] ??
      words[resolveStrongKey(words, rootStrong) ?? ""] ??
      custom[resolveStrongKey(custom, rootStrong) ?? ""])
    : undefined;

  const surface = instanceSurface(customEntry, dictionaryEntry?.occurrences);

  return {
    strong_number:
      customEntry?.strong_number ?? dictionaryEntry?.strong_number ?? strong,
    hebrew: customEntry?.hebrew ?? dictionaryEntry?.lemma,
    translit_en:
      customEntry?.transliteration_en ??
      dictionaryEntry?.translit_en ??
      dictionaryEntry?.transliteration_en,
    translit_es:
      customEntry?.transliteration_es ??
      dictionaryEntry?.translit_es ??
      dictionaryEntry?.transliteration_es,
    definitions: [
      ...mapStaticDefinitions(customEntry?.definitions, language),
      ...mapStaticDefinitions(dictionaryEntry?.definitions, language),
    ],
    root: customEntry?.root ?? getRootLemma(rootEntry),
    root_strong: rootStrong,
    root_translit_en:
      rootEntry && "translit_en" in rootEntry
        ? rootEntry.translit_en
        : rootEntry?.transliteration_en,
    root_translit_es:
      rootEntry && "translit_es" in rootEntry
        ? rootEntry.translit_es
        : rootEntry?.transliteration_es,
    root_definitions: mapStaticDefinitions(rootEntry?.definitions, language),
    occurrences_count: surface.total,
    instances: surface.instances,
  };
};

export const loadLexiconEntryFromStatic = async (
  strong: string,
  language: "en" | "es" | "he",
): Promise<LexiconResponse | null> => {
  const asset = await loadLexiconEntryAsset(strong);
  if (asset) {
    return toResponseFromAsset(asset, language);
  }

  return loadLexiconEntryFromFullDictionaries(strong, language);
};

export const prefetchLexiconEntry = (strong?: string): void => {
  if (!strong) return;
  void loadLexiconEntryAsset(strong);
};
