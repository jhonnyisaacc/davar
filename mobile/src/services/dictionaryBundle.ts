import type { LexiconResponse } from "@/src/types/api";

export interface DictionaryDefinitionItem {
  text_en?: string;
  text_es?: string;
  text_he?: string;
  source?: string;
  review_status?: "approved" | "imported" | "draft";
  license?: string;
}

export interface CustomDefinitionEntry {
  strong_number: string;
  hebrew?: string;
  transliteration_en?: string;
  transliteration_es?: string;
  definitions: DictionaryDefinitionItem[];
  root?: string;
  root_strong?: string;
}

export interface RootEntry {
  strong_number: string;
  lemma: string;
  transliteration: string;
  definitions: DictionaryDefinitionItem[];
  root?: string;
  root_strong?: string;
  occurrences_count?: number;
}

export interface DictionaryBundle {
  custom_definitions: Record<string, CustomDefinitionEntry>;
  roots: Record<string, RootEntry>;
  prefixes: Record<string, unknown>;
}

const mapDefinitions = (
  definitions: DictionaryDefinitionItem[] | undefined,
): LexiconResponse["definitions"] =>
  (definitions ?? []).flatMap((item) => {
    const mapped: LexiconResponse["definitions"] = [];
    if (item.text_en) {
      mapped.push({
        text: item.text_en,
        source: item.source ?? "custom",
        language: "en",
        review_status: item.review_status,
        license: item.license,
      });
    }
    if (item.text_es) {
      mapped.push({
        text: item.text_es,
        source: item.source ?? "custom",
        language: "es",
        review_status: item.review_status,
        license: item.license,
      });
    }
    if (item.text_he) {
      mapped.push({
        text: item.text_he,
        source: item.source ?? "custom",
        language: "he",
        review_status: item.review_status,
        license: item.license,
      });
    }
    return mapped;
  });

const mergeEntry = (
  current: LexiconResponse | undefined,
  incoming: LexiconResponse,
): LexiconResponse => {
  if (!current) return incoming;

  return {
    ...current,
    hebrew: current.hebrew || incoming.hebrew,
    definitions: [...current.definitions, ...incoming.definitions],
    root: current.root || incoming.root,
    root_strong: current.root_strong || incoming.root_strong,
    occurrences_count: Math.max(
      current.occurrences_count,
      incoming.occurrences_count,
    ),
    instances:
      current.instances.length > 0 ? current.instances : incoming.instances,
  };
};

const customEntryToLexicon = (
  entry: CustomDefinitionEntry,
): LexiconResponse => ({
  strong_number: String(entry.strong_number ?? ""),
  hebrew: entry.hebrew,
  definitions: mapDefinitions(entry.definitions),
  root: entry.root,
  root_strong: entry.root_strong,
  root_definitions: [],
  occurrences_count: 0,
  instances: [],
});

const rootEntryToLexicon = (entry: RootEntry): LexiconResponse => ({
  strong_number: String(entry.strong_number ?? ""),
  hebrew: entry.lemma,
  definitions: mapDefinitions(entry.definitions),
  root: entry.root ?? entry.lemma,
  root_strong: entry.root_strong ?? entry.strong_number,
  root_definitions: [],
  occurrences_count: entry.occurrences_count ?? 0,
  instances: [],
});

export const buildLexiconEntries = (
  bundle: DictionaryBundle,
): LexiconResponse[] => {
  const entries = new Map<string, LexiconResponse>();

  for (const entry of Object.values(bundle.custom_definitions ?? {})) {
    const mapped = customEntryToLexicon(entry);
    if (!mapped.strong_number.trim()) continue;
    entries.set(
      mapped.strong_number,
      mergeEntry(entries.get(mapped.strong_number), mapped),
    );
  }

  for (const entry of Object.values(bundle.roots ?? {})) {
    const mapped = rootEntryToLexicon(entry);
    if (!mapped.strong_number.trim()) continue;
    entries.set(
      mapped.strong_number,
      mergeEntry(entries.get(mapped.strong_number), mapped),
    );
  }

  return [...entries.values()];
};
